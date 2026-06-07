from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import shutil
import uuid
import cadquery as cq

app = FastAPI(title="CADScope Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
CONVERTED_DIR = BASE_DIR / "converted"

UPLOAD_DIR.mkdir(exist_ok=True)
CONVERTED_DIR.mkdir(exist_ok=True)

app.mount("/converted", StaticFiles(directory=str(CONVERTED_DIR)), name="converted")

BROWSER_MESH = {"stl", "obj", "ply", "glb", "gltf"}
BROWSER_2D = {"dxf"}
STEP_FORMATS = {"step", "stp"}

SUPPORTED_FORMATS = BROWSER_MESH | BROWSER_2D | STEP_FORMATS


def get_extension(filename: str) -> str:
    if not filename or "." not in filename:
        return ""
    return filename.rsplit(".", 1)[-1].lower().strip()


def classify_file(ext: str) -> str:
    if ext in BROWSER_MESH:
        return "browser_mesh"

    if ext in BROWSER_2D:
        return "browser_dxf"

    if ext in STEP_FORMATS:
        return "converted_mesh"

    return "unsupported"


def convert_step_to_stl(input_path: Path, output_path: Path) -> None:
    model = cq.importers.importStep(str(input_path))
    cq.exporters.export(model, str(output_path))


@app.get("/")
def root():
    return {
        "message": "CADScope backend running",
        "status": "ok",
        "supported_uploads": sorted(SUPPORTED_FORMATS),
        "backend_converts": sorted(STEP_FORMATS),
    }


@app.post("/upload")
async def upload_file(request: Request, file: UploadFile = File(...)):
    ext = get_extension(file.filename)

    if ext not in SUPPORTED_FORMATS:
        raise HTTPException(
            status_code=415,
            detail=f".{ext or 'unknown'} is not supported. Upload STL, OBJ, PLY, GLB, GLTF, DXF, STEP, or STP.",
        )

    file_id = str(uuid.uuid4())
    saved_name = f"{file_id}.{ext}"
    saved_path = UPLOAD_DIR / saved_name

    try:
        with saved_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    finally:
        await file.close()

    viewer_mode = classify_file(ext)

    converted_url = None
    converted_extension = None

    if ext in STEP_FORMATS:
        converted_name = f"{file_id}.stl"
        converted_path = CONVERTED_DIR / converted_name

        try:
            convert_step_to_stl(saved_path, converted_path)
        except Exception as exc:
            return {
                "file_id": file_id,
                "original_name": file.filename,
                "extension": ext,
                "saved_as": saved_name,
                "viewer_mode": "conversion_failed",
                "converted_url": None,
                "converted_extension": None,
                "error": str(exc),
            }

        converted_url = f"{str(request.base_url).rstrip('/')}/converted/{converted_name}"
        converted_extension = "stl"

    return {
        "file_id": file_id,
        "original_name": file.filename,
        "extension": ext,
        "saved_as": saved_name,
        "viewer_mode": viewer_mode,
        "converted_url": converted_url,
        "converted_extension": converted_extension,
        "message": "File processed successfully",
    }