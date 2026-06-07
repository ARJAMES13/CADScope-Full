import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import { Bounds, Center, Html, OrbitControls } from "@react-three/drei";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import DxfParser from "dxf-parser";
import {
  AlertTriangle,
  Box,
  CheckCircle2,
  FolderOpen,
  Home,
  Loader2,
  Maximize2,
  MousePointer2,
  RefreshCw,
  Ruler,
} from "lucide-react";

const SUPPORTED_3D = ["glb", "gltf", "stl", "obj", "ply"];
const SUPPORTED_2D = ["dxf"];
const SUPPORTED_ALL = [...SUPPORTED_3D, ...SUPPORTED_2D];

function getExtension(fileName = "") {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

function formatBytes(bytes = 0) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(2)} ${units[index]}`;
}

function formatDimension(value) {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1000) return value.toFixed(1);
  if (Math.abs(value) >= 10) return value.toFixed(2);
  return value.toFixed(3);
}

function routeLabel(route) {
  if (route === "mesh") return "3D";
  if (route === "dxf") return "2D";
  return "—";
}

async function inspectFile(file) {
  const ext = getExtension(file.name);

  if (SUPPORTED_3D.includes(ext)) {
    return { ext, route: "mesh", title: "Ready", message: "3D preview" };
  }

  if (SUPPORTED_2D.includes(ext)) {
    return { ext, route: "dxf", title: "Ready", message: "DXF preview" };
  }

  return {
    ext,
    route: "unsupported",
    title: "File not supported",
    message: "Use STL, OBJ, PLY, GLB, GLTF, or DXF.",
  };
}

function useObjectUrl(file) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    if (!file) {
      setUrl(null);
      return undefined;
    }
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return url;
}

function reportObjectMetrics(object, onMetrics) {
  if (!object || !onMetrics) return;
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  onMetrics({ x: size.x, y: size.y, z: size.z });
}

function prepareObject(object) {
  const clone = object.clone(true);
  clone.traverse((child) => {
    if (!child.isMesh) return;
    if (child.geometry && !child.geometry.attributes.normal) child.geometry.computeVertexNormals?.();

    if (!child.material) {
      child.material = new THREE.MeshStandardMaterial({ color: "#d7dce6", roughness: 0.58, metalness: 0.08 });
      return;
    }

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const nextMaterials = materials.map((mat) => {
      const next = mat.clone();
      next.roughness = next.roughness ?? 0.58;
      next.metalness = next.metalness ?? 0.08;
      next.needsUpdate = true;
      return next;
    });
    child.material = Array.isArray(child.material) ? nextMaterials : nextMaterials[0];
  });
  return clone;
}

class ViewerErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  static getDerivedStateFromProps(props, state) {
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey };
    return null;
  }

  render() {
    if (this.state.error) {
      return <StatusPanel type="error" title="Preview failed" message={this.state.error.message || "Could not open this file."} />;
    }
    return this.props.children;
  }
}

function Header({ compact = false }) {
  return (
    <header className={`topbar ${compact ? "compact" : ""}`}>
      <div className="brand">
        <div className="brand-mark"><Box size={22} /></div>
        <div>
          <strong>CADScope</strong>
          <span>3D & DXF viewer</span>
        </div>
      </div>
      <div className="supported-mini">
        {SUPPORTED_ALL.map((format) => <span key={format}>{format.toUpperCase()}</span>)}
      </div>
    </header>
  );
}

function DropZone({ onFile }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const handleFiles = (files) => {
    const nextFile = files?.[0];
    if (nextFile) onFile(nextFile);
  };

  return (
    <section
      className={`drop-panel ${dragging ? "is-dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        handleFiles(event.dataTransfer.files);
      }}
    >
      <div className="drop-inner">
        <div className="file-icon"><FolderOpen size={42} /></div>
        <h1>Drop your file</h1>
        <p>Preview supported CAD exports directly in the browser.</p>
        <button className="primary-btn" onClick={() => inputRef.current?.click()}>
          Select file
        </button>
        <div className="format-strip">
          {SUPPORTED_ALL.map((format) => <span key={format}>{format.toUpperCase()}</span>)}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        hidden
        accept=".glb,.gltf,.stl,.obj,.ply,.dxf"
        onChange={(event) => handleFiles(event.target.files)}
      />
    </section>
  );
}

function Landing({ onFile }) {
  return (
    <div className="landing-page">
      <Header />
      <main className="hero-section">
        <DropZone onFile={onFile} />
      </main>
    </div>
  );
}

function RendererSettings() {
  const { gl } = useThree();
  useEffect(() => {
    gl.localClippingEnabled = true;
  }, [gl]);
  return null;
}

function CameraResetButton() {
  const { camera, controls } = useThree();
  return (
    <Html fullscreen>
      <button
        className="floating-reset"
        onClick={() => {
          camera.position.set(4, 3, 5);
          controls?.target?.set(0, 0, 0);
          controls?.update?.();
        }}
      >
        <Home size={14} /> Reset
      </button>
    </Html>
  );
}

function GLTFModel({ url, onMetrics }) {
  const gltf = useLoader(GLTFLoader, url);
  const scene = useMemo(() => prepareObject(gltf.scene), [gltf.scene]);
  useEffect(() => reportObjectMetrics(scene, onMetrics), [scene, onMetrics]);
  return <primitive object={scene} />;
}

function STLModel({ url, onMetrics }) {
  const geometry = useLoader(STLLoader, url);
  useEffect(() => {
    if (!geometry || !onMetrics) return;
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    const size = new THREE.Vector3();
    geometry.boundingBox.getSize(size);
    onMetrics({ x: size.x, y: size.y, z: size.z });
  }, [geometry, onMetrics]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#d7dce6" roughness={0.58} metalness={0.08} />
    </mesh>
  );
}

function OBJModel({ url, onMetrics }) {
  const obj = useLoader(OBJLoader, url);
  const scene = useMemo(() => prepareObject(obj), [obj]);
  useEffect(() => reportObjectMetrics(scene, onMetrics), [scene, onMetrics]);
  return <primitive object={scene} />;
}

function PLYModel({ url, onMetrics }) {
  const geometry = useLoader(PLYLoader, url);
  useEffect(() => {
    if (!geometry || !onMetrics) return;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    const size = new THREE.Vector3();
    geometry.boundingBox.getSize(size);
    onMetrics({ x: size.x, y: size.y, z: size.z });
  }, [geometry, onMetrics]);
  const hasColors = Boolean(geometry.attributes.color);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial vertexColors={hasColors} color={hasColors ? undefined : "#d7dce6"} roughness={0.58} metalness={0.08} />
    </mesh>
  );
}

function MeshModel({ url, ext, onMetrics }) {
  if (ext === "glb" || ext === "gltf") return <GLTFModel url={url} onMetrics={onMetrics} />;
  if (ext === "stl") return <STLModel url={url} onMetrics={onMetrics} />;
  if (ext === "obj") return <OBJModel url={url} onMetrics={onMetrics} />;
  if (ext === "ply") return <PLYModel url={url} onMetrics={onMetrics} />;
  return null;
}

function MeshViewer({ file, ext, onMetrics }) {
  const url = useObjectUrl(file);
  if (!url) return <StatusPanel title="Loading" message="Preparing preview." loading />;

  return (
    <ViewerErrorBoundary resetKey={`${file.name}-${file.size}-${ext}`}>
      <div className="viewer-card">
        <div className="viewer-toolbar">
          <span><MousePointer2 size={14} /> Orbit</span>
          <span>Pan</span>
          <span>Zoom</span>
        </div>
        <Canvas
          dpr={[1, 1.5]}
          camera={{ position: [4, 3, 5], fov: 40 }}
          gl={{ antialias: true, powerPreference: "high-performance" }}
        >
          <RendererSettings />
          <color attach="background" args={["#f8fafc"]} />
          <ambientLight intensity={0.92} />
          <directionalLight position={[6, 8, 5]} intensity={2.1} />
          <directionalLight position={[-4, 3, -4]} intensity={0.52} />
          <gridHelper args={[14, 14, "#d6dde8", "#edf1f7"]} />
          <axesHelper args={[2.2]} />
          <Suspense fallback={<Html center><div className="loader-pill">Loading model</div></Html>}>
            <Bounds fit clip margin={1.15}>
              <Center><MeshModel url={url} ext={ext} onMetrics={onMetrics} /></Center>
            </Bounds>
          </Suspense>
          <CameraResetButton />
          <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
        </Canvas>
      </div>
    </ViewerErrorBoundary>
  );
}

function getPoint(point) {
  return { x: Number(point?.x ?? point?.[0] ?? 0), y: Number(point?.y ?? point?.[1] ?? 0) };
}

function arcToLines(entity) {
  const center = getPoint(entity.center);
  const radius = Number(entity.radius || 0);
  if (!radius) return [];

  const startRaw = Number(entity.startAngle ?? 0);
  const endRaw = Number(entity.endAngle ?? 360);
  const useDegrees = Math.abs(startRaw) > Math.PI * 2 || Math.abs(endRaw) > Math.PI * 2;
  let start = useDegrees ? THREE.MathUtils.degToRad(startRaw) : startRaw;
  let end = useDegrees ? THREE.MathUtils.degToRad(endRaw) : endRaw;
  if (end < start) end += Math.PI * 2;

  const segments = 42;
  const points = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = start + ((end - start) * i) / segments;
    points.push({ x: center.x + radius * Math.cos(t), y: center.y + radius * Math.sin(t) });
  }
  return points.slice(0, -1).map((p, index) => ({ type: "line", p1: p, p2: points[index + 1] }));
}

function extractDxfDrawables(dxf) {
  const drawable = [];
  for (const entity of dxf.entities || []) {
    if (entity.type === "LINE") {
      const vertices = entity.vertices || [];
      const p1 = vertices[0] || entity.start || entity.startPoint;
      const p2 = vertices[1] || entity.end || entity.endPoint;
      if (p1 && p2) drawable.push({ type: "line", p1, p2 });
    }

    if ((entity.type === "LWPOLYLINE" || entity.type === "POLYLINE") && entity.vertices?.length >= 2) {
      for (let i = 0; i < entity.vertices.length - 1; i += 1) {
        drawable.push({ type: "line", p1: entity.vertices[i], p2: entity.vertices[i + 1] });
      }
      if (entity.shape || entity.closed) {
        drawable.push({ type: "line", p1: entity.vertices[entity.vertices.length - 1], p2: entity.vertices[0] });
      }
    }

    if (entity.type === "CIRCLE" && entity.center && entity.radius) {
      drawable.push({ type: "circle", c: entity.center, r: Number(entity.radius) });
    }

    if (entity.type === "ARC" && entity.center && entity.radius) {
      drawable.push(...arcToLines(entity));
    }
  }
  return drawable;
}

function DxfViewer({ file }) {
  const [entities, setEntities] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadDxf() {
      try {
        setLoading(true);
        const text = await file.text();
        const parser = new DxfParser();
        const dxf = parser.parseSync(text);
        const drawable = extractDxfDrawables(dxf);
        if (!cancelled) {
          setEntities(drawable);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not read this DXF file.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (file) loadDxf();
    return () => { cancelled = true; };
  }, [file]);

  const bounds = useMemo(() => {
    if (!entities.length) return { minX: -10, minY: -10, width: 20, height: 20 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const add = (point) => {
      const p = getPoint(point);
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    };

    entities.forEach((entity) => {
      if (entity.type === "line") {
        add(entity.p1);
        add(entity.p2);
      } else if (entity.type === "circle") {
        const c = getPoint(entity.c);
        add({ x: c.x - entity.r, y: c.y - entity.r });
        add({ x: c.x + entity.r, y: c.y + entity.r });
      }
    });

    const span = Math.max(maxX - minX, maxY - minY);
    const pad = span * 0.08 || 10;
    return { minX: minX - pad, minY: minY - pad, width: Math.max(maxX - minX + 2 * pad, 1), height: Math.max(maxY - minY + 2 * pad, 1) };
  }, [entities]);

  if (loading) return <StatusPanel title="Loading" message="Reading DXF." loading />;
  if (error) return <StatusPanel type="error" title="DXF failed" message={error} />;
  if (!entities.length) return <StatusPanel type="error" title="No preview" message="No supported DXF entities found." />;

  return (
    <div className="viewer-card dxf-card">
      <div className="viewer-toolbar"><span>DXF</span><span>{entities.length} entities</span></div>
      <svg className="dxf-svg" viewBox={`${bounds.minX} ${-bounds.minY - bounds.height} ${bounds.width} ${bounds.height}`}>
        <g transform="scale(1,-1)">
          {entities.map((entity, index) => {
            if (entity.type === "line") {
              const p1 = getPoint(entity.p1);
              const p2 = getPoint(entity.p2);
              return <line key={index} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} />;
            }
            const c = getPoint(entity.c);
            return <circle key={index} cx={c.x} cy={c.y} r={entity.r} />;
          })}
        </g>
      </svg>
    </div>
  );
}

function StatusPanel({ title, message, type = "info", loading = false }) {
  return (
    <div className={`status-panel ${type}`}>
      {loading ? <Loader2 className="spin" size={34} /> : type === "error" ? <AlertTriangle size={38} /> : <AlertTriangle size={38} />}
      <h2>{title}</h2>
      <p>{message}</p>
      {type === "error" && <div className="support-list">{SUPPORTED_ALL.map((format) => <span key={format}>{format.toUpperCase()}</span>)}</div>}
    </div>
  );
}

function Sidebar({ file, fileInfo, metrics, onReset }) {
  const ext = fileInfo?.ext || getExtension(file.name);

  return (
    <aside className="sidebar">
      <section className="side-card file-card">
        <div className="card-kicker">File</div>
        <h2>{file.name}</h2>
        <div className="file-grid">
          <div><span>Format</span><strong>{ext.toUpperCase() || "—"}</strong></div>
          <div><span>Size</span><strong>{formatBytes(file.size)}</strong></div>
          <div><span>Type</span><strong>{routeLabel(fileInfo?.route)}</strong></div>
          <div><span>Status</span><strong>{fileInfo?.title || "Checking"}</strong></div>
        </div>
        <button className="secondary-btn" onClick={onReset}><RefreshCw size={15} /> New file</button>
      </section>

      <section className="side-card">
        <div className="side-title"><Ruler size={17} /> Dimensions</div>
        {metrics ? (
          <div className="dimension-grid">
            <div><span>X</span><strong>{formatDimension(metrics.x)}</strong></div>
            <div><span>Y</span><strong>{formatDimension(metrics.y)}</strong></div>
            <div><span>Z</span><strong>{formatDimension(metrics.z)}</strong></div>
          </div>
        ) : <p className="muted">Available for 3D files.</p>}
      </section>

      <section className="side-card compact">
        <div className="side-title"><Maximize2 size={17} /> Controls</div>
        <p className="muted">Orbit · Pan · Zoom</p>
      </section>
    </aside>
  );
}

function Workspace({ file, fileInfo, onReset }) {
  const [metrics, setMetrics] = useState(null);

  return (
    <main className="workspace">
      <section className="viewer-shell">
        {!fileInfo && <StatusPanel title="Loading" message="Checking file." loading />}
        {fileInfo?.route === "mesh" && <MeshViewer file={file} ext={fileInfo.ext} onMetrics={setMetrics} />}
        {fileInfo?.route === "dxf" && <DxfViewer file={file} />}
        {fileInfo?.route === "unsupported" && <StatusPanel type="error" title="Unsupported file" message="Supported formats only:" />}
      </section>
      <Sidebar file={file} fileInfo={fileInfo} metrics={metrics} onReset={onReset} />
    </main>
  );
}

export default function App() {
  const [file, setFile] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);

  async function handleUpload(uploadedFile) {
    setFile(uploadedFile);
    setFileInfo(null);
    setFileInfo(await inspectFile(uploadedFile));
  }

  function reset() {
    setFile(null);
    setFileInfo(null);
  }

  return (
    <div className="app-shell">
      <style>{css}</style>
      {!file ? <Landing onFile={handleUpload} /> : <><Header compact /><Workspace file={file} fileInfo={fileInfo} onReset={reset} /></>}
    </div>
  );
}

const css = `
*{box-sizing:border-box}html,body,#root{width:100%;height:100%;margin:0}body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#061b44;color:#101827;overflow:hidden}button{font:inherit}.app-shell{height:100vh}.landing-page{height:100vh;background:#0058d8;color:white;overflow:hidden}.landing-page:before{content:"";position:fixed;inset:104px 0 0;background:radial-gradient(circle at 18% 20%,rgba(255,255,255,.16),transparent 30%),linear-gradient(115deg,#0737a4 0%,#005be2 54%,#0077f0 100%)}.landing-page:after{content:"";position:fixed;inset:104px 0 0;background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);background-size:28px 28px;mask-image:radial-gradient(circle at 35% 32%,#000,transparent 72%)}.topbar{height:104px;position:relative;z-index:5;display:flex;align-items:center;justify-content:space-between;padding:0 min(8vw,92px);background:white;color:#101827;border-bottom:1px solid #e5eaf2}.topbar.compact{height:72px;padding:0 28px;background:rgba(255,255,255,.9);backdrop-filter:blur(16px)}.brand{display:flex;align-items:center;gap:14px}.brand-mark{width:52px;height:52px;border-radius:16px;background:linear-gradient(135deg,#102b8c,#3387ff);color:white;display:grid;place-items:center;box-shadow:0 18px 40px rgba(0,44,140,.18)}.topbar.compact .brand-mark{width:42px;height:42px}.brand strong{display:block;font-size:22px;letter-spacing:-.04em}.brand span{display:block;font-size:12px;color:#6b7280;margin-top:2px}.supported-mini{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.supported-mini span{font-size:12px;font-weight:850;color:#0b4cc5;background:#eef5ff;border:1px solid #cfe2ff;border-radius:999px;padding:7px 10px}.hero-section{position:relative;z-index:2;height:calc(100vh - 104px);display:grid;place-items:center;padding:48px}.drop-panel{width:min(1180px,92vw);height:min(480px,64vh);border:1.5px dashed rgba(255,255,255,.55);border-radius:8px;padding:26px;transition:.16s ease}.drop-panel.is-dragging{transform:scale(1.01);border-color:white;background:rgba(255,255,255,.08)}.drop-inner{height:100%;border-radius:8px;background:rgba(255,255,255,.17);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.12)}.file-icon{width:72px;height:72px;border-radius:18px;border:1px solid rgba(255,255,255,.28);display:grid;place-items:center;color:white;margin-bottom:20px;background:rgba(255,255,255,.08)}.drop-inner h1{margin:0 0 8px;font-size:24px;letter-spacing:-.03em;color:white}.drop-inner p{margin:0 0 22px;color:rgba(255,255,255,.78);font-size:15px}.primary-btn{border:0;cursor:pointer;background:#f59e0b;color:white;min-width:178px;height:52px;border-radius:4px;text-transform:uppercase;letter-spacing:.08em;font-size:13px;font-weight:900;box-shadow:0 18px 40px rgba(0,0,0,.16);transition:.15s ease}.primary-btn:hover{background:#f28c00;transform:translateY(-1px)}.format-strip{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:26px}.format-strip span{font-size:13px;font-weight:900;letter-spacing:.08em;color:rgba(255,255,255,.88)}.workspace{height:calc(100vh - 72px);display:grid;grid-template-columns:minmax(0,1fr) 350px;gap:16px;padding:16px;background:#f3f6fb;overflow:hidden}.viewer-shell{min-width:0;min-height:0}.viewer-card,.status-panel{height:100%;min-height:0;border:1px solid #dce4f0;border-radius:18px;background:white;box-shadow:0 20px 60px rgba(15,23,42,.08);overflow:hidden;position:relative}.viewer-toolbar{position:absolute;top:16px;left:16px;z-index:20;display:flex;gap:8px}.viewer-toolbar span{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.92);border:1px solid #e5eaf2;color:#334155;font-size:12px;font-weight:800;padding:9px 12px;border-radius:999px;box-shadow:0 10px 28px rgba(15,23,42,.08)}.floating-reset{position:absolute;right:16px;top:16px;z-index:30;display:inline-flex;align-items:center;gap:7px;border:1px solid #e5eaf2;background:rgba(255,255,255,.92);color:#111827;padding:9px 12px;border-radius:999px;font-size:12px;font-weight:850;cursor:pointer;box-shadow:0 10px 28px rgba(15,23,42,.08)}.loader-pill{background:#101827;color:white;border-radius:12px;padding:10px 14px;font-size:13px;font-weight:850}.dxf-card{background:#fbfdff}.dxf-svg{width:100%;height:100%;display:block}.dxf-svg line,.dxf-svg circle{stroke:#111827;stroke-width:.35%;vector-effect:non-scaling-stroke;fill:none;stroke-linecap:round;stroke-linejoin:round}.sidebar{min-height:0;overflow:auto;display:flex;flex-direction:column;gap:14px}.side-card{background:white;border:1px solid #dce4f0;border-radius:18px;padding:18px;box-shadow:0 16px 44px rgba(15,23,42,.06)}.file-card h2{margin:8px 0 16px;font-size:20px;line-height:1.15;letter-spacing:-.035em;word-break:break-word}.card-kicker{text-transform:uppercase;letter-spacing:.16em;font-size:11px;color:#8a93a3;font-weight:900}.file-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}.file-grid div,.dimension-grid div{background:#f8fafc;border:1px solid #eef2f7;border-radius:14px;padding:12px;text-align:center}.file-grid span,.dimension-grid span{display:block;color:#7b8494;font-size:12px;margin-bottom:6px}.file-grid strong,.dimension-grid strong{display:block;font-size:14px;color:#111827;word-break:break-word}.secondary-btn{border:0;cursor:pointer;width:100%;background:#101827;color:white;padding:13px;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;gap:9px;font-weight:850}.side-title{display:flex;align-items:center;gap:9px;font-weight:900;margin-bottom:12px}.muted{color:#64748b;line-height:1.55;font-size:14px;margin:0}.dimension-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}.status-panel{display:grid;place-items:center;text-align:center;padding:42px}.status-panel h2{font-size:34px;letter-spacing:-.045em;margin:18px 0 8px;color:#111827}.status-panel p{max-width:640px;line-height:1.6;color:#64748b;margin:0}.status-panel.error{background:#fff7ed;border-color:#fed7aa}.support-list{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:20px}.support-list span{font-size:12px;font-weight:850;letter-spacing:.07em;color:#0b4cc5;background:#eef5ff;border:1px solid #cfe2ff;border-radius:999px;padding:8px 10px}.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:960px){body{overflow:auto}.landing-page,.app-shell{height:auto;min-height:100vh}.topbar{height:auto;min-height:84px;padding:18px 22px;gap:16px;align-items:flex-start}.supported-mini{justify-content:flex-end}.hero-section{height:auto;min-height:calc(100vh - 84px);padding:22px}.drop-panel{height:500px}.workspace{height:auto;min-height:calc(100vh - 72px);grid-template-columns:1fr;overflow:visible}.viewer-card,.status-panel{height:70vh;min-height:520px}.sidebar{overflow:visible;display:grid;grid-template-columns:1fr 1fr}.file-card{grid-column:1/-1}}@media(max-width:640px){.topbar{padding:16px}.supported-mini{display:none}.brand strong{font-size:20px}.hero-section{padding:12px}.drop-panel{width:100%;height:460px;padding:16px}.drop-inner h1{font-size:22px}.workspace{padding:10px}.viewer-toolbar{display:none}.viewer-card,.status-panel{height:64vh;min-height:460px}.sidebar{grid-template-columns:1fr}}
`;
 