
import React from 'react';
import { GraphProject } from '../../types';
import ReservoirPanel from '../ReservoirPanel';

interface GraphSidebarProps {
  project: GraphProject;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isUploading: boolean;
  onDeleteDocument?: (docId: string) => void;
}

const GraphSidebar: React.FC<GraphSidebarProps> = ({ 
  project, 
  onUpload, 
  isUploading,
  onDeleteDocument 
}) => {
  // Convert project documents to the format ReservoirPanel expects
  const documents = project.documents.map(doc => ({
    id: doc.id,
    name: doc.name,
    size: doc.size,
    type: doc.type,
  }));

  return (
    <ReservoirPanel
      documents={documents}
      onUpload={onUpload}
      isUploading={isUploading}
      onDelete={onDeleteDocument}
    />
  );
};

export default GraphSidebar;

