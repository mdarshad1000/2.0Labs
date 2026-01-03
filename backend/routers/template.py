"""
Template router for managing analysis templates.
"""
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database.base import get_db
from database.crud import template_crud
from auth.dependencies import get_current_user, get_required_user
from models.auth import CurrentUser

router = APIRouter(prefix="/api/templates", tags=["templates"])


# ============= Request/Response Models =============

class MetricModel(BaseModel):
    """A metric column in a template."""
    id: str
    label: str
    description: Optional[str] = None
    type: Optional[str] = None  # 'numeric', 'qualitative', 'binary'


class TemplateResponse(BaseModel):
    """Template response model."""
    id: str
    name: str
    subtitle: Optional[str] = None
    description: Optional[str] = None
    metrics: list[MetricModel] = Field(default_factory=list)
    user_id: Optional[str] = None
    is_system: bool = False
    forked_from_id: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class TemplateCreateRequest(BaseModel):
    """Request body for creating a template."""
    name: str = Field(..., min_length=1, max_length=255)
    subtitle: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    metrics: list[MetricModel] = Field(default_factory=list)


class TemplateForkRequest(BaseModel):
    """Request body for forking a template."""
    name: Optional[str] = Field(None, max_length=255)


class TemplateUpdateRequest(BaseModel):
    """Request body for updating a template."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    subtitle: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    metrics: Optional[list[MetricModel]] = None


class TemplateListResponse(BaseModel):
    """Response for listing templates."""
    templates: list[TemplateResponse]


# ============= Helper Functions =============

def template_to_response(template) -> TemplateResponse:
    """Convert a Template model to a TemplateResponse."""
    return TemplateResponse(
        id=str(template.id),
        name=template.name,
        subtitle=template.subtitle,
        description=template.description,
        metrics=[MetricModel(**m) for m in (template.metrics or [])],
        user_id=str(template.user_id) if template.user_id else None,
        is_system=template.is_system,
        forked_from_id=str(template.forked_from_id) if template.forked_from_id else None,
        created_at=template.created_at.isoformat() if template.created_at else None,
        updated_at=template.updated_at.isoformat() if template.updated_at else None,
    )


# ============= Endpoints =============

@router.get("", response_model=TemplateListResponse)
async def list_templates(
    current_user: Annotated[Optional[CurrentUser], Depends(get_current_user)],
    db: Session = Depends(get_db),
):
    """
    List all available templates.
    Returns system templates + user's own templates (if authenticated).
    """
    user_id = current_user.id if current_user else None
    templates = template_crud.get_all_for_user(db, user_id=user_id)
    return TemplateListResponse(
        templates=[template_to_response(t) for t in templates]
    )


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(
    template_id: UUID,
    current_user: Annotated[Optional[CurrentUser], Depends(get_current_user)],
    db: Session = Depends(get_db),
):
    """
    Get a single template by ID.
    Returns template if it's a system template or owned by the user.
    """
    template = template_crud.get(db, id=template_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    # Check access: system templates are public, user templates require ownership
    if not template.is_system:
        if not current_user or template.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to access this template"
            )
    
    return template_to_response(template)


@router.post("", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    request: TemplateCreateRequest,
    current_user: Annotated[CurrentUser, Depends(get_required_user)],
    db: Session = Depends(get_db),
):
    """
    Create a new user-owned template.
    Requires authentication.
    """
    template = template_crud.create(
        db,
        name=request.name,
        user_id=current_user.id,
        subtitle=request.subtitle,
        description=request.description,
        metrics=[m.model_dump() for m in request.metrics],
    )
    return template_to_response(template)


@router.post("/{template_id}/fork", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def fork_template(
    template_id: UUID,
    request: TemplateForkRequest,
    current_user: Annotated[CurrentUser, Depends(get_required_user)],
    db: Session = Depends(get_db),
):
    """
    Fork (clone) an existing template.
    Creates a copy owned by the current user.
    Requires authentication.
    """
    # Verify source template exists and is accessible
    source = template_crud.get(db, id=template_id)
    if not source:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    # Check access to source template
    if not source.is_system:
        if source.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to fork this template"
            )
    
    forked = template_crud.fork(
        db,
        template_id=template_id,
        user_id=current_user.id,
        new_name=request.name,
    )
    
    if not forked:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fork template"
        )
    
    return template_to_response(forked)


@router.put("/{template_id}", response_model=TemplateResponse)
async def update_template(
    template_id: UUID,
    request: TemplateUpdateRequest,
    current_user: Annotated[CurrentUser, Depends(get_required_user)],
    db: Session = Depends(get_db),
):
    """
    Update a template.
    Only the owner can update their templates.
    System templates cannot be modified.
    """
    template = template_crud.get(db, id=template_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    if not template_crud.can_modify(template, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to modify this template"
        )
    
    updated = template_crud.update(
        db,
        db_obj=template,
        name=request.name,
        subtitle=request.subtitle,
        description=request.description,
        metrics=[m.model_dump() for m in request.metrics] if request.metrics else None,
    )
    
    return template_to_response(updated)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: UUID,
    current_user: Annotated[CurrentUser, Depends(get_required_user)],
    db: Session = Depends(get_db),
):
    """
    Delete a template.
    Only the owner can delete their templates.
    System templates cannot be deleted.
    """
    template = template_crud.get(db, id=template_id)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    if not template_crud.can_modify(template, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this template"
        )
    
    deleted = template_crud.delete(db, db_obj=template)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete system templates"
        )
    
    return None

