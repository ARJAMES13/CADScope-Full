from fastapi import FastAPI, UploadFile, File
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

UPLOAD_DIR = Path("uploads")
CONVERTED_DIR = Path("converted")
UPLOAD_DIR.mkdir(exist_ok=True)
CONVERTED_DIR.mkdir(exist_ok=True)

app.mount("/converted", StaticFiles(directory="converted"), name="converted")

BROWSER_MESH = {"stl", "obj", "ply", "glb", "gltf"}
STEP_FORMATS = {"step", "stp", "iges", "igs"}
DWG_DXF = {"dwg", "dxf"}
PREMIUM_CAD = {
    "ipt", "iam", "sldprt", "sldasm",
    "catpart", "catproduct", "prt",
    "x_t", "x_b", "sat"
}

def classify_file(ext: str):
    if ext in BROWSER_MESH:
        return "browser_mesh"
    if ext in STEP_FORMATS:
        return "converted_mesh"
    if ext in DWG_DXF:
        return "dwg_dxf"
    if ext in PREMIUM_CAD:
        return "premium_cad"
    return "unsupported"

def convert_step_to_stl(input_path: Path, output_path: Path):
    model = cq.importers.importStep(str(input_path))
    cq.exporters.export(model, str(output_path))

@app.get("/")
def root():
    return {
        "message": "CADScope backend running",
        "status": "ok"
    }

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    ext = file.filename.split(".")[-1].lower()
    file_id = str(uuid.uuid4())

    saved_name = f"{file_id}.{ext}"
    saved_path = UPLOAD_DIR / saved_name

    with saved_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    viewer_mode = classify_file(ext)

    converted_url = None
    converted_extension = None

    if ext in STEP_FORMATS:
        converted_name = f"{file_id}.stl"
        converted_path = CONVERTED_DIR / converted_name

        try:
            convert_step_to_stl(saved_path, converted_path)
            converted_url = f"http://127.0.0.1:8000/converted/{converted_name}"
            converted_extension = "stl"
        except Exception as e:
            return {
                "file_id": file_id,
                "original_name": file.filename,
                "extension": ext,
                "saved_as": saved_name,
                "viewer_mode": "conversion_failed",
                "error": str(e),
            }

    return {
        "file_id": file_id,
        "original_name": file.filename,
        "extension": ext,
        "saved_as": saved_name,
        "viewer_mode": viewer_mode,
        "converted_url": converted_url,
        "converted_extension": converted_extension,
        "message": "File uploaded and classified successfully"
    }