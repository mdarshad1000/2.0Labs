import boto3
from botocore.client import Config
from typing import Optional
import asyncio

from backend.core.config import get_settings
from backend.core.logfire_config import log_info, log_error


class S3Service:
    """S3-compatible storage service for Supabase Storage."""
    
    def __init__(self):
        self.settings = get_settings()
        self._client = None
        
    @property
    def client(self):
        if not self._client:
            session = boto3.session.Session()
            self._client = session.client(
                's3',
                endpoint_url=self.settings.bucket.endpoint,
                aws_access_key_id=self.settings.bucket.access_key_id.get_secret_value(),
                aws_secret_access_key=self.settings.bucket.secret_key.get_secret_value(),
                region_name=self.settings.bucket.region,
                config=Config(
                    signature_version='s3v4',
                    s3={'addressing_style': 'path'} 
                )
            )
            log_info("Supabase S3 client initialized", 
                    endpoint=self.settings.bucket.endpoint,
                    bucket=self.settings.bucket.bucket,
                    region=self.settings.bucket.region)
        return self._client
    
    async def upload_file(self, key: str, content: bytes, content_type: str = "application/octet-stream") -> bool:
        """Upload file content to Supabase Storage"""
        try:
            response = await asyncio.to_thread(
                self.client.put_object,
                Bucket=self.settings.bucket.bucket,
                Key=key,
                Body=content,
                ContentType=content_type
            )
            
            log_info("File uploaded successfully", key=key, size=len(content))
            return True
            
        except Exception as e:
            log_error("Failed to upload file", error=e, key=key)
            return False
    
    async def download_file(self, key: str) -> Optional[bytes]:
        """Download file content from Supabase Storage"""
        try:
            response = await asyncio.to_thread(
                self.client.get_object,
                Bucket=self.settings.bucket.bucket,
                Key=key
            )
            
            content = response['Body'].read()
            log_info("File downloaded successfully", key=key, size=len(content))
            return content
            
        except Exception as e:
            log_error("Failed to download file", error=e, key=key)
            return None
    
    async def file_exists(self, key: str) -> bool:
        """Check if file exists in Supabase Storage"""
        try:
            await asyncio.to_thread(
                self.client.head_object,
                Bucket=self.settings.bucket.bucket,
                Key=key
            )
            
            log_info("File exists", key=key)
            return True
            
        except self.client.exceptions.NoSuchKey:
            return False
        except Exception as e:
            log_error("Error checking file existence", error=e, key=key)
            return False
    
    def get_presigned_upload_url(self, key: str, expires_in: int = 3600) -> str:
        """Generate presigned URL for direct client upload"""
        try:
            presigned_url = self.client.generate_presigned_url(
                ClientMethod='put_object',
                Params={
                    'Bucket': self.settings.bucket.bucket,
                    'Key': key
                },
                ExpiresIn=expires_in
            )
            
            log_info("Generated presigned upload URL", key=key, expires_in=expires_in)
            return presigned_url
            
        except Exception as e:
            log_error("Failed to generate presigned upload URL", error=e, key=key)
            raise
    
    def get_presigned_download_url(self, key: str, expires_in: int = 3600) -> str:
        """Generate presigned URL for direct client download"""
        try:
            presigned_url = self.client.generate_presigned_url(
                ClientMethod='get_object',
                Params={
                    'Bucket': self.settings.bucket.bucket,
                    'Key': key
                },
                ExpiresIn=expires_in
            )
            
            log_info("Generated presigned download URL", key=key, expires_in=expires_in)
            return presigned_url
            
        except Exception as e:
            log_error("Failed to generate presigned download URL", error=e, key=key)
            raise
    
    def delete_file(self, key: str) -> bool:
        """Delete file from Supabase Storage"""
        try:
            self.client.delete_object(
                Bucket=self.settings.bucket.bucket,
                Key=key
            )
            log_info("File deleted successfully", key=key)
            return True
            
        except Exception as e:
            log_error("Failed to delete file", error=e, key=key)
            return False

    def get_public_url(self, key: str) -> str:
        """Get public URL for a file in Supabase Storage"""
        # Construct the public URL
        endpoint = self.settings.bucket.endpoint
        if not endpoint.startswith('http'):
            endpoint = f"https://{endpoint}"
        return f"{endpoint}/{key}"
    
    def generate_presigned_url(self, key: str, expiration: int = 3600) -> str:
        """
        Generate a presigned URL for downloading a file from Supabase Storage.
        
        Args:
            key: The file key/path in storage
            expiration: URL expiration time in seconds (default: 1 hour)
            
        Returns:
            Presigned URL string
        """
        try:
            url = self.client.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': self.settings.bucket.bucket,
                    'Key': key
                },
                ExpiresIn=expiration
            )
            log_info("Generated presigned URL", key=key, expiration=expiration)
            return url
        except Exception as e:
            log_error("Failed to generate presigned URL", error=e, key=key)
            raise


# Singleton instance
s3_service = S3Service()
# Backward compatibility alias
spaces_service = s3_service

async def download_file():
    """Test function to download a file from Supabase Storage."""
    key = 'documents/3b862bc4-bae0-467a-b5f4-02ebb0e32c3c/f5a08657-fbc1-4e0b-84c4-5207c0a01194.xlsx'
    
    # Debug: Print configuration
    log_info("Supabase S3 Configuration", 
             endpoint=s3_service.settings.bucket.endpoint,
             bucket=s3_service.settings.bucket.bucket,
             region=s3_service.settings.bucket.region)
    
    # Check if file exists first
    exists = await s3_service.file_exists(key)
    log_info("File exists check", key=key, exists=exists)
    
    if not exists:
        log_error("File does not exist", key=key)
        return
    
    # Download the file
    xlsx_data = await s3_service.download_file(key)
    
    if xlsx_data is None:
        log_error("Failed to download file", key=key)
        return
    
    # Write the data
    with open('xlsx_data.xlsx', 'wb') as f:
        f.write(xlsx_data)
    
    log_info("File downloaded and saved successfully", key=key, size=len(xlsx_data))
    
if __name__ == '__main__':
    asyncio.run(download_file())