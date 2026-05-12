# File Operations API
from fastapi import APIRouter, HTTPException
from pathlib import Path
from starlette.responses import JSONResponse
tmp_path = '/path/to/project/tmp'
router = APIRouter()

@router.get('/api/files/read')
def read_file(file_path: str):
    file = Path(tmp_path, file_path)
    if not file.exists() or not file.is_file():
        raise HTTPException(status_code=404, detail='File not found')
    return JSONResponse(content={'content': file.read_text()})

@router.post('/api/files/write')
def write_file(file_path: str, content: str):
    file = Path(tmp_path, file_path)
    if not file.parent.exists():
        file.parent.mkdir(parents=True)
    file.write_text(content)
    return JSONResponse(content={'message': 'File written successfully'})

@router.delete('/api/files/delete')
def delete_file(file_path: str):
    file = Path(tmp_path, file_path)
    if not file.exists() or not file.is_file():
        raise HTTPException(status_code=404, detail='File not found')
    file.unlink()
    return JSONResponse(content={'message': 'File deleted successfully'})