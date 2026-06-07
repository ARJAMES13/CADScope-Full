import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import { OrbitControls, Bounds, Center, Html } from "@react-three/drei";
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
  FileText,
  Home,
  Info,
  Layers3,
  Loader2,
  MousePointer2,
  RefreshCw,
  Ruler,
  Upload,
  Zap,
} from "lucide-react";

const LOCAL_MESH_FORMATS = ["glb", "gltf", "stl", "obj", "ply"];
const LOCAL_2D_FORMATS = ["dxf"];
const BACKEND_CONVERT_FORMATS = ["step", "stp"]; // keep only formats your current backend reliably converts

const NATIVE_BLOCKED_FORMATS = {
  ipt: {
    title: "Native Inventor part is not supported",
    message: "IPT is a proprietary Autodesk Inventor binary. Export it as STEP/STP first.",
    instruction: "Inventor: File → Export → CAD Format → STEP/STP",
  },
  iam: {
    title: "Native Inventor assembly is not supported",
    message: "IAM files reference IPT part files and are unreliable in a web-only viewer. Export the complete assembly as STEP/STP.",
    instruction: "Inventor assembly: File → Export → CAD Format → STEP/STP",
  },
  sldprt: {
    title: "Native SolidWorks part is not supported",
    message: "SLDPRT is a proprietary SolidWorks file. Export it as STEP AP242/AP214 first.",
    instruction: "SolidWorks: File → Save As → STEP AP242/AP214",
  },
  sldasm: {
    title: "Native SolidWorks assembly is not supported",
    message: "SLDASM depends on linked SLDPRT files. Export the full assembly as STEP AP242/AP214.",
    instruction: "SolidWorks assembly: File → Save As → STEP AP242/AP214",
  },
  prt: {
    title: "Native Creo/NX part is not supported",
    message: "PRT can be Creo or NX native CAD. Export it as STEP/STP first.",
    instruction: "Creo/NX: File → Export or Save a Copy → STEP/STP",
  },
  asm: {
    title: "Native Creo assembly is not supported",
    message: "ASM is a proprietary Creo assembly format. Export the complete assembly as STEP/STP.",
    instruction: "Creo: Save a Copy → STEP/STP",
  },
  f3d: {
    title: "Native Fusion 360 file is not supported",
    message: "F3D is a Fusion native/cloud format. Export as STEP/STP, STL, OBJ, or 3MF first.",
    instruction: "Fusion 360: File → Export → STEP/STP or STL",
  },
  f3z: {
    title: "Fusion 360 archive is not supported",
    message: "F3Z is a Fusion archive. Open it in Fusion and export as STEP/STP first.",
    instruction: "Fusion 360: Export the archive as STEP/STP",
  },
};

function getExtension(fileName = "") {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

function formatBytes(bytes = 0) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(2)} ${units[index]}`;
}

function getRouteLabel(route) {
  if (route === "mesh") return "Local 3D viewer";
  if (route === "dxf") return "Local DXF viewer";
  if (route === "convert") return "Backend CAD conversion";
  if (route === "unsupported") return "Unsupported";
  return "Checking";
}

async function inspectFile(file) {
  const ext = getExtension(file.name);
  const buffer = await file.slice(0, 65536).arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);

  const isOleCompound =
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0 &&
    bytes[4] === 0xa1 &&
    bytes[5] === 0xb1 &&
    bytes[6] === 0x1a &&
    bytes[7] === 0xe1;

  if (text.includes("ISO-10303-21")) {
    return {
      ext: ["step", "stp"].includes(ext) ? ext : "stp",
      route: "convert",
      title: "STEP data detected",
      message: "This file contains ISO-10303 STEP data and will be sent to the backend converter.",
      isOleCompound,
    };
  }

  if (NATIVE_BLOCKED_FORMATS[ext]) {
    return {
      ext,
      route: "unsupported",
      ...NATIVE_BLOCKED_FORMATS[ext],
      isOleCompound,
    };
  }

  if (LOCAL_MESH_FORMATS.includes(ext)) {
    return {
      ext,
      route: "mesh",
      title: "Local mesh file",
      message: "This file opens directly in the browser. No backend upload is needed.",
      isOleCompound,
    };
  }

  if (LOCAL_2D_FORMATS.includes(ext)) {
    return {
      ext,
      route: "dxf",
      title: "Local DXF drawing",
      message: "This DXF file is parsed directly in the browser.",
      isOleCompound,
    };
  }

  if (BACKEND_CONVERT_FORMATS.includes(ext)) {
    return {
      ext,
      route: "convert",
      title: "Neutral CAD file",
      message: "This file will be converted by the backend to a browser-viewable mesh.",
      isOleCompound,
    };
  }

  return {
    ext,
    route: "unsupported",
    title: "Unsupported file type",
    message: "This viewer currently supports STL, OBJ, PLY, GLB, GLTF, DXF, STEP, and STP only.",
    instruction: "Export your CAD model as STEP/STP or STL and upload that file.",
    isOleCompound,
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

function cloneAndPrepareObject(object, clippingPlane) {
  const cloned = object.clone(true);
  cloned.traverse((child) => {
    if (!child.isMesh) return;

    if (!child.geometry.attributes.normal) child.geometry.computeVertexNormals?.();

    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      const clonedMaterials = materials.map((mat) => {
        const next = mat.clone();
        next.clippingPlanes = clippingPlane ? [clippingPlane] : [];
        next.clipShadows = true;
        next.needsUpdate = true;
        return next;
      });
      child.material = Array.isArray(child.material) ? clonedMaterials : clonedMaterials[0];
    } else {
      child.material = new THREE.MeshStandardMaterial({ color: "#d7d7d7", roughness: 0.55 });
    }
  });
  return cloned;
}

function reportObjectMetrics(object, onMetrics) {
  if (!object || !onMetrics) return;
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  onMetrics({ x: size.x, y: size.y, z: size.z });
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
    if (props.resetKey !== state.resetKey) {
      return { error: null, resetKey: props.resetKey };
    }
    return null;
  }

  render() {
    if (this.state.error) {
      return <ErrorPanel message={this.state.error.message || "The viewer could not load this file."} />;
    }
    return this.props.children;
  }
}

function ErrorPanel({ message }) {
  return (
    <div className="placeholder-viewer error-viewer">
      <AlertTriangle size={46} />
      <h2>Could not load this file</h2>
      <p>{message}</p>
    </div>
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
      className={`dropzone ${dragging ? "dropzone-active" : ""}`}
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
      <div className="upload-icon"><Upload size={28} /></div>
      <h1>Fast browser CAD viewer.</h1>
      <p>Open mesh and DXF files locally. Convert only neutral CAD formats through your backend. Native Inventor/SolidWorks/Creo/NX files are intentionally not offered.</p>
      <button className="primary-btn" onClick={() => inputRef.current?.click()}>Choose file</button>
      <div className="format-line">STL · OBJ · PLY · GLB · GLTF · DXF · STEP · STP</div>
      <input
        ref={inputRef}
        type="file"
        hidden
        accept=".glb,.gltf,.stl,.obj,.ply,.dxf,.step,.stp"
        onChange={(event) => handleFiles(event.target.files)}
      />
    </section>
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
        className="reset-camera-btn"
        onClick={() => {
          camera.position.set(4, 3, 5);
          controls?.target?.set(0, 0, 0);
          controls?.update?.();
        }}
      >
        <Home size={14} /> Reset view
      </button>
    </Html>
  );
}

function GLTFModel({ url, onMetrics, clippingPlane }) {
  const gltf = useLoader(GLTFLoader, url);
  const scene = useMemo(() => cloneAndPrepareObject(gltf.scene, clippingPlane), [gltf.scene, clippingPlane]);

  useEffect(() => {
    reportObjectMetrics(scene, onMetrics);
  }, [scene, onMetrics]);

  return <primitive object={scene} />;
}

function STLModel({ url, onMetrics, clippingPlane }) {
  const geometry = useLoader(STLLoader, url);

  useEffect(() => {
    if (!geometry || !onMetrics) return;
    geometry.computeBoundingBox();
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    const size = new THREE.Vector3();
    geometry.boundingBox.getSize(size);
    onMetrics({ x: size.x, y: size.y, z: size.z });
  }, [geometry, onMetrics]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#d7d7d7" roughness={0.55} metalness={0.08} clippingPlanes={clippingPlane ? [clippingPlane] : []} clipShadows />
    </mesh>
  );
}

function OBJModel({ url, onMetrics, clippingPlane }) {
  const obj = useLoader(OBJLoader, url);
  const scene = useMemo(() => cloneAndPrepareObject(obj, clippingPlane), [obj, clippingPlane]);

  useEffect(() => {
    reportObjectMetrics(scene, onMetrics);
  }, [scene, onMetrics]);

  return <primitive object={scene} />;
}

function PLYModel({ url, onMetrics, clippingPlane }) {
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
      <meshStandardMaterial vertexColors={hasColors} color={hasColors ? undefined : "#d7d7d7"} roughness={0.55} metalness={0.08} clippingPlanes={clippingPlane ? [clippingPlane] : []} clipShadows />
    </mesh>
  );
}

function MeshModel({ url, ext, onMetrics, clippingPlane }) {
  if (ext === "glb" || ext === "gltf") return <GLTFModel url={url} onMetrics={onMetrics} clippingPlane={clippingPlane} />;
  if (ext === "stl") return <STLModel url={url} onMetrics={onMetrics} clippingPlane={clippingPlane} />;
  if (ext === "obj") return <OBJModel url={url} onMetrics={onMetrics} clippingPlane={clippingPlane} />;
  if (ext === "ply") return <PLYModel url={url} onMetrics={onMetrics} clippingPlane={clippingPlane} />;
  return null;
}

function MeshViewer({ file = null, ext, sourceUrl = null, onMetrics, section }) {
  const localUrl = useObjectUrl(file);
  const url = sourceUrl || localUrl;
  const clippingPlane = useMemo(
    () => (section.enabled ? new THREE.Plane(new THREE.Vector3(1, 0, 0), section.offset) : null),
    [section.enabled, section.offset]
  );

  if (!url) return <LoadingPanel message="Preparing model..." />;

  return (
    <ViewerErrorBoundary resetKey={`${url}-${ext}`}>
      <div className="viewer-card">
        <div className="viewer-toolbar">
          <span><MousePointer2 size={14} /> Orbit</span>
          <span>Pan</span>
          <span>Zoom</span>
          {section.enabled && <span>Section X active</span>}
        </div>
        <Canvas
          dpr={[1, 1.5]}
          camera={{ position: [4, 3, 5], fov: 40 }}
          gl={{ antialias: true, powerPreference: "high-performance" }}
        >
          <RendererSettings />
          <color attach="background" args={["#fbfbfb"]} />
          <ambientLight intensity={0.85} />
          <directionalLight position={[6, 8, 5]} intensity={2.0} />
          <directionalLight position={[-4, 3, -4]} intensity={0.5} />
          <gridHelper args={[14, 14, "#d6d6d6", "#ececec"]} />
          <axesHelper args={[2.2]} />
          <Suspense fallback={<Html center><div className="loading-pill">Loading model...</div></Html>}>
            <Bounds fit clip margin={1.15}>
              <Center>
                <MeshModel url={url} ext={ext} onMetrics={onMetrics} clippingPlane={clippingPlane} />
              </Center>
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
  return {
    x: Number(point?.x ?? point?.[0] ?? 0),
    y: Number(point?.y ?? point?.[1] ?? 0),
  };
}

function arcToLines(entity) {
  const center = getPoint(entity.center);
  const radius = Number(entity.radius || 0);
  if (!radius) return [];

  const startRaw = Number(entity.startAngle ?? 0);
  const endRaw = Number(entity.endAngle ?? 360);
  const toRad = Math.abs(startRaw) > Math.PI * 2 || Math.abs(endRaw) > Math.PI * 2;
  let start = toRad ? THREE.MathUtils.degToRad(startRaw) : startRaw;
  let end = toRad ? THREE.MathUtils.degToRad(endRaw) : endRaw;
  if (end < start) end += Math.PI * 2;

  const segments = 40;
  const points = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = start + ((end - start) * i) / segments;
    points.push({ x: center.x + radius * Math.cos(t), y: center.y + radius * Math.sin(t) });
  }

  return points.slice(0, -1).map((p, i) => ({ type: "line", p1: p, p2: points[i + 1] }));
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
        if (!cancelled) setError(err.message || "Could not parse this DXF file.");
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
    return {
      minX: minX - pad,
      minY: minY - pad,
      width: Math.max(maxX - minX + 2 * pad, 1),
      height: Math.max(maxY - minY + 2 * pad, 1),
    };
  }, [entities]);

  if (loading) return <LoadingPanel message="Parsing DXF locally..." />;
  if (error) return <ErrorPanel message={error} />;
  if (!entities.length) return <ErrorPanel message="DXF parsed, but no supported drawable LINE, POLYLINE, CIRCLE, or ARC entities were found." />;

  return (
    <div className="viewer-card dxf-card">
      <div className="viewer-toolbar">
        <span>DXF 2D preview</span>
        <span>{entities.length} renderable entities</span>
      </div>
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

function LoadingPanel({ message = "Loading..." }) {
  return (
    <div className="placeholder-viewer loading-viewer">
      <Loader2 className="spin" size={42} />
      <h2>{message}</h2>
      <p>Please wait. Large CAD files can take a little time.</p>
    </div>
  );
}

function UnsupportedViewer({ fileInfo }) {
  return (
    <div className="placeholder-viewer native-warning">
      <AlertTriangle size={46} />
      <h2>{fileInfo?.title || "Unsupported file"}</h2>
      <p>{fileInfo?.message || "This file type is not supported by this viewer."}</p>
      <div className="export-box">
        <strong>Recommended path</strong>
        <span>{fileInfo?.instruction || "Export the model as STEP/STP, STL, OBJ, PLY, GLB, GLTF, or DXF."}</span>
      </div>
    </div>
  );
}

function BackendStatus({ backendInfo }) {
  if (!backendInfo) return <p className="muted">No backend action needed yet.</p>;

  if (backendInfo.status === "local") {
    return <p className="status success"><Zap size={16} /> Opened locally. No upload.</p>;
  }

  if (backendInfo.status === "checking") {
    return <p className="status uploading"><Loader2 className="spin" size={16} /> Checking file...</p>;
  }

  if (backendInfo.status === "uploading") {
    return <p className="status uploading"><Loader2 className="spin" size={16} /> Uploading for conversion...</p>;
  }

  if (backendInfo.status === "error") {
    return <p className="status error">Conversion failed: {backendInfo.error}</p>;
  }

  if (backendInfo.status === "unsupported") {
    return <p className="status error">Unsupported format. Not uploaded.</p>;
  }

  if (backendInfo.status === "success") {
    return (
      <div className="backend-data">
        <p className="status success"><CheckCircle2 size={16} /> Backend response received</p>
        <div className="backend-row"><span>Viewer mode</span><strong>{backendInfo.data?.viewer_mode || "unknown"}</strong></div>
        {backendInfo.data?.file_id && <div className="backend-row"><span>File ID</span><code>{backendInfo.data.file_id}</code></div>}
      </div>
    );
  }

  return <p className="muted">Waiting...</p>;
}

function Sidebar({ file, fileInfo, backendInfo, metrics, section, setSection, onReset }) {
  const ext = fileInfo?.ext || getExtension(file.name);

  return (
    <aside className="sidebar">
      <div className="panel">
        <div className="panel-label">Current file</div>
        <h2 className="filename">{file.name}</h2>
        <div className="meta-grid">
          <div><span>Format</span><strong>{ext.toUpperCase() || "UNKNOWN"}</strong></div>
          <div><span>Size</span><strong>{formatBytes(file.size)}</strong></div>
          <div><span>Route</span><strong>{getRouteLabel(fileInfo?.route)}</strong></div>
          <div><span>Backend</span><strong>{fileInfo?.route === "convert" ? "Required" : "Skipped"}</strong></div>
        </div>
        <button className="secondary-btn" onClick={onReset}><RefreshCw size={15} /> Load another file</button>
      </div>

      <div className="panel slim">
        <div className="panel-title"><Info size={18} /> File check</div>
        <p className="muted"><strong>{fileInfo?.title || "Checking file"}</strong><br />{fileInfo?.message || "Inspecting file..."}</p>
      </div>

      <div className="panel slim">
        <div className="panel-title"><FileText size={18} /> Processing</div>
        <BackendStatus backendInfo={backendInfo} />
      </div>

      <div className="panel slim">
        <div className="panel-title"><Ruler size={18} /> Measurements</div>
        {metrics ? (
          <div className="backend-data">
            <div className="backend-row"><span>X width</span><strong>{metrics.x.toFixed(3)}</strong></div>
            <div className="backend-row"><span>Y depth</span><strong>{metrics.y.toFixed(3)}</strong></div>
            <div className="backend-row"><span>Z height</span><strong>{metrics.z.toFixed(3)}</strong></div>
          </div>
        ) : <p className="muted">Bounding-box dimensions appear after a 3D model loads.</p>}
      </div>

      <div className="panel slim">
        <div className="panel-title"><Layers3 size={18} /> View tools</div>
        <label className="toggle-line">
          <input type="checkbox" checked={section.enabled} onChange={(event) => setSection((prev) => ({ ...prev, enabled: event.target.checked }))} />
          Enable X section
        </label>
        <input className="slider" type="range" min="-50" max="50" value={section.offset} onChange={(event) => setSection((prev) => ({ ...prev, offset: Number(event.target.value) }))} />
      </div>
    </aside>
  );
}

function Workspace({ file, fileInfo, backendInfo, onReset }) {
  const [metrics, setMetrics] = useState(null);
  const [section, setSection] = useState({ enabled: false, offset: 0 });

  const convertedUrl = backendInfo?.data?.converted_url;
  const convertedExt = backendInfo?.data?.converted_extension || "stl";
  const isConvertedMesh = backendInfo?.data?.viewer_mode === "converted_mesh" && convertedUrl;

  return (
    <section className="workspace">
      <div className="viewer-area">
        {fileInfo?.route === "mesh" && <MeshViewer file={file} ext={fileInfo.ext} onMetrics={setMetrics} section={section} />}
        {fileInfo?.route === "dxf" && <DxfViewer file={file} />}
        {fileInfo?.route === "unsupported" && <UnsupportedViewer fileInfo={fileInfo} />}
        {fileInfo?.route === "convert" && backendInfo?.status !== "success" && backendInfo?.status !== "error" && <LoadingPanel message="Converting CAD file..." />}
        {fileInfo?.route === "convert" && backendInfo?.status === "error" && <ErrorPanel message={backendInfo.error} />}
        {fileInfo?.route === "convert" && backendInfo?.status === "success" && !isConvertedMesh && <ErrorPanel message="Backend responded, but did not return a converted mesh URL." />}
        {fileInfo?.route === "convert" && isConvertedMesh && <MeshViewer file={null} ext={convertedExt} sourceUrl={convertedUrl} onMetrics={setMetrics} section={section} />}
      </div>

      <Sidebar
        file={file}
        fileInfo={fileInfo}
        backendInfo={backendInfo}
        metrics={metrics}
        section={section}
        setSection={setSection}
        onReset={onReset}
      />
    </section>
  );
}

export default function App() {
  const [file, setFile] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);
  const [backendInfo, setBackendInfo] = useState(null);

  async function uploadForConversion(uploadedFile, info) {
    const ext = getExtension(uploadedFile.name);
    const fileForUpload =
      info.ext !== ext
        ? new File([uploadedFile], `${uploadedFile.name}.${info.ext}`, { type: uploadedFile.type })
        : uploadedFile;

    const formData = new FormData();
    formData.append("file", fileForUpload);

    setBackendInfo({ status: "uploading" });

    try {
      const response = await fetch("http://127.0.0.1:8000/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Backend error ${response.status}`);
      }

      const data = await response.json();
      setBackendInfo({ status: "success", data });
    } catch (error) {
      setBackendInfo({ status: "error", error: error.message || "Could not connect to backend." });
    }
  }

  async function handleUpload(uploadedFile) {
    setFile(uploadedFile);
    setFileInfo(null);
    setBackendInfo({ status: "checking" });
    setTimeout(() => setBackendInfo((current) => current?.status === "checking" ? current : current), 0);

    const info = await inspectFile(uploadedFile);
    setFileInfo(info);

    if (info.route === "mesh" || info.route === "dxf") {
      setBackendInfo({ status: "local" });
      return;
    }

    if (info.route === "unsupported") {
      setBackendInfo({ status: "unsupported" });
      return;
    }

    if (info.route === "convert") {
      await uploadForConversion(uploadedFile, info);
    }
  }

  function reset() {
    setFile(null);
    setFileInfo(null);
    setBackendInfo(null);
  }

  return (
    <>
      <style>{css}</style>
      <div className="app-shell">
        <header className="topbar">
          <div className="brand">
            <div className="brand-icon"><Box size={20} /></div>
            <div><strong>CADScope</strong><span>Reliable web CAD viewer</span></div>
          </div>
          <div className="topbar-note">Local-first viewer · STEP/STP conversion only</div>
        </header>

        <main className="main-content">
          {!file ? (
            <div className="landing"><DropZone onFile={handleUpload} /></div>
          ) : (
            <Workspace file={file} fileInfo={fileInfo} backendInfo={backendInfo} onReset={reset} />
          )}
        </main>
      </div>
    </>
  );
}

const css = `
*{box-sizing:border-box}html,body,#root{width:100%;min-height:100%;margin:0}body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f4f5f7;color:#15171a}button{font:inherit}.app-shell{min-height:100vh;background:#f4f5f7}.topbar{height:64px;display:flex;align-items:center;justify-content:space-between;padding:0 28px;background:rgba(255,255,255,.88);border-bottom:1px solid #e5e7eb;backdrop-filter:blur(16px);position:sticky;top:0;z-index:50}.brand{display:flex;align-items:center;gap:12px}.brand-icon{width:38px;height:38px;border-radius:12px;background:#111827;color:white;display:grid;place-items:center}.brand strong{display:block;font-size:17px;letter-spacing:-.02em}.brand span{display:block;font-size:12px;color:#6b7280;margin-top:1px}.topbar-note{font-size:13px;color:#6b7280;background:#f3f4f6;border:1px solid #e5e7eb;padding:8px 12px;border-radius:999px}.main-content{padding:18px}.landing{min-height:calc(100vh - 100px);display:grid;place-items:center}.dropzone{width:min(980px,94vw);min-height:520px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;border:1px dashed #c9ced6;background:#fff;border-radius:28px;padding:42px;box-shadow:0 30px 90px rgba(15,23,42,.08);transition:.2s ease}.dropzone-active{border-color:#2563eb;background:#eff6ff;transform:scale(1.005)}.upload-icon{width:68px;height:68px;border-radius:22px;display:grid;place-items:center;background:#111827;color:white;margin-bottom:24px}.dropzone h1{max-width:760px;font-size:clamp(42px,6vw,76px);line-height:.95;letter-spacing:-.06em;margin:0}.dropzone p{max-width:650px;color:#5b6472;font-size:17px;line-height:1.65;margin:22px 0 28px}.primary-btn,.secondary-btn{border:0;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:12px;font-weight:750;transition:.15s ease}.primary-btn{background:#111827;color:#fff;padding:13px 22px}.primary-btn:hover,.secondary-btn:hover{background:#000;transform:translateY(-1px)}.format-line{margin-top:22px;color:#8a93a3;font-size:13px}.workspace{min-height:calc(100vh - 100px);display:grid;grid-template-columns:minmax(0,2.35fr) minmax(320px,.8fr);gap:18px}.viewer-area{min-width:0}.viewer-card,.placeholder-viewer{height:calc(100vh - 100px);min-height:680px;border-radius:22px;overflow:hidden;background:#fff;border:1px solid #e5e7eb;box-shadow:0 24px 80px rgba(15,23,42,.10);position:relative}.reset-camera-btn{position:absolute;right:14px;top:14px;z-index:30;display:inline-flex;align-items:center;gap:7px;border:1px solid #e5e7eb;background:rgba(255,255,255,.88);color:#111827;padding:8px 11px;border-radius:999px;font-size:12px;font-weight:750;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.06);backdrop-filter:blur(12px)}.reset-camera-btn:hover{background:#fff}.viewer-toolbar{position:absolute;top:14px;left:14px;z-index:20;display:flex;gap:8px;flex-wrap:wrap}.viewer-toolbar span{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.85);border:1px solid #e5e7eb;color:#374151;font-size:12px;font-weight:650;padding:8px 10px;border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,.06);backdrop-filter:blur(12px)}.loading-pill{background:rgba(17,24,39,.92);color:white;padding:10px 14px;border-radius:12px;font-size:13px;font-weight:700}.dxf-card{background:#fbfbfb}.dxf-svg{width:100%;height:100%;display:block}.dxf-svg line,.dxf-svg circle{stroke:#111827;stroke-width:.35%;vector-effect:non-scaling-stroke;fill:none;stroke-linecap:round;stroke-linejoin:round}.sidebar{display:flex;flex-direction:column;gap:14px}.panel{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:20px;box-shadow:0 18px 60px rgba(15,23,42,.06)}.panel.slim{padding:18px}.panel-label{text-transform:uppercase;letter-spacing:.16em;font-size:11px;color:#8a93a3;font-weight:800}.panel-title{display:flex;align-items:center;gap:9px;font-size:15px;font-weight:800;margin-bottom:14px}.filename{margin:10px 0 18px;font-size:24px;line-height:1.15;letter-spacing:-.03em;word-break:break-word}.meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}.meta-grid div,.backend-row{background:#f7f8fa;border:1px solid #eef0f3;border-radius:14px;padding:12px}.meta-grid span,.backend-row span{display:block;color:#7b8494;font-size:12px;margin-bottom:5px}.meta-grid strong,.backend-row strong{display:block;font-size:14px;color:#111827;word-break:break-word}.secondary-btn{width:100%;background:#111827;color:white;padding:12px}.muted{color:#6b7280;line-height:1.55;font-size:14px;margin:0}.muted strong{color:#111827}.status{display:flex;align-items:center;gap:7px;font-size:14px;font-weight:750;margin:0 0 12px}.status.success{color:#15803d}.status.error{color:#dc2626}.status.uploading{color:#b45309}.backend-data{display:grid;gap:10px}.backend-row code{display:block;color:#111827;font-size:11px;word-break:break-all}.toggle-line{display:flex;gap:8px;align-items:center;font-size:14px;color:#374151;margin-bottom:10px}.slider{width:100%;accent-color:#111827}.placeholder-viewer{display:grid;place-items:center;text-align:center;padding:40px;color:#374151}.placeholder-viewer h2{font-size:34px;letter-spacing:-.04em;margin:18px 0 8px;color:#111827}.placeholder-viewer p{max-width:660px;line-height:1.6;color:#6b7280}.placeholder-viewer.native-warning{background:#fff7ed;border-color:#fed7aa}.placeholder-viewer.error-viewer{background:#fff1f2;border-color:#fecdd3}.placeholder-viewer.loading-viewer{background:#fff}.export-box{margin-top:18px;max-width:620px;background:white;border:1px solid #fed7aa;border-radius:16px;padding:16px;text-align:left;box-shadow:0 12px 35px rgba(15,23,42,.06)}.export-box strong{display:block;color:#111827;margin-bottom:6px}.export-box span{display:block;color:#6b7280;line-height:1.55}.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:1050px){.workspace{grid-template-columns:1fr}.viewer-card,.placeholder-viewer{height:72vh;min-height:520px}.sidebar{display:grid;grid-template-columns:1fr 1fr}.sidebar .panel:first-child{grid-column:1/-1}}@media(max-width:720px){.topbar-note{display:none}.main-content{padding:10px}.sidebar{grid-template-columns:1fr}.dropzone{min-height:460px;padding:28px}.dropzone h1{font-size:42px}.viewer-card,.placeholder-viewer{min-height:480px}}
`;
