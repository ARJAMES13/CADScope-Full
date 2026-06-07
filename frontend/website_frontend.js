import React, { Suspense, useMemo, useRef, useState } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls, Bounds, Center, Html } from "@react-three/drei";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import { Upload, Box, FileCode2, Layers3, Ruler, Rotate3D, AlertTriangle, Sparkles } from "lucide-react";

const meshFormats = ["glb", "gltf", "stl", "obj", "ply"];
const cad2DFormats = ["dwg", "dxf"];
const futureFormats = ["step", "stp", "iges", "igs", "ipt", "iam", "sldprt", "sldasm", "catpart", "catproduct", "prt", "x_t", "x_b", "sat"];

function getExtension(fileName = "") {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

function getFileCategory(ext) {
  if (meshFormats.includes(ext)) return "mesh";
  if (cad2DFormats.includes(ext)) return "cad2d";
  if (futureFormats.includes(ext)) return "future";
  return "unknown";
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

function DropZone({ onFile }) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  const handleFiles = (files) => {
    const file = files?.[0];
    if (file) onFile(file);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`relative overflow-hidden rounded-3xl border border-dashed p-10 text-center transition-all ${
        isDragging ? "border-white bg-white/15" : "border-white/20 bg-white/5"
      }`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
      <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-5">
        <div className="rounded-2xl bg-white/10 p-5 shadow-2xl">
          <Upload className="h-10 w-10" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold md:text-3xl">Drop your CAD / 3D file here</h2>
          <p className="mt-3 text-sm text-zinc-300 md:text-base">
            View GLB, GLTF, STL, OBJ, and PLY locally in your browser. DWG/DXF and heavy CAD conversion are structured for the next phase.
          </p>
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-zinc-950 shadow-lg transition hover:scale-[1.02]"
        >
          Choose file
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".glb,.gltf,.stl,.obj,.ply,.dwg,.dxf,.step,.stp,.iges,.igs,.ipt,.iam,.sldprt,.sldasm"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
    </div>
  );
}

function FileInfo({ file, ext, category, onReset }) {
  return (
    <aside className="rounded-3xl border border-white/10 bg-zinc-950/70 p-5 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-zinc-500">Loaded file</p>
          <h3 className="mt-2 break-all text-lg font-semibold">{file.name}</h3>
        </div>
        <div className="rounded-2xl bg-white/10 px-3 py-2 text-sm font-bold uppercase">{ext}</div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl bg-white/5 p-4">
          <p className="text-zinc-500">Size</p>
          <p className="mt-1 font-medium">{formatBytes(file.size)}</p>
        </div>
        <div className="rounded-2xl bg-white/5 p-4">
          <p className="text-zinc-500">Type</p>
          <p className="mt-1 font-medium capitalize">{category}</p>
        </div>
      </div>

      <div className="mt-5 space-y-3 text-sm text-zinc-300">
        <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
          <Rotate3D className="h-4 w-4" /> Orbit, pan, zoom
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
          <Layers3 className="h-4 w-4" /> Format-based viewer routing
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
          <Ruler className="h-4 w-4" /> Measurement tools coming next
        </div>
      </div>

      <button
        onClick={onReset}
        className="mt-5 w-full rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold transition hover:bg-white/10"
      >
        Load another file
      </button>
    </aside>
  );
}

function GLTFModel({ url }) {
  const gltf = useLoader(GLTFLoader, url);
  return <primitive object={gltf.scene} />;
}

function STLModel({ url }) {
  const geometry = useLoader(STLLoader, url);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial roughness={0.55} metalness={0.15} />
    </mesh>
  );
}

function OBJModel({ url }) {
  const obj = useLoader(OBJLoader, url);
  return <primitive object={obj} />;
}

function PLYModel({ url }) {
  const geometry = useLoader(PLYLoader, url);
  geometry.computeVertexNormals();
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial roughness={0.55} metalness={0.15} />
    </mesh>
  );
}

function MeshModel({ url, ext }) {
  if (ext === "glb" || ext === "gltf") return <GLTFModel url={url} />;
  if (ext === "stl") return <STLModel url={url} />;
  if (ext === "obj") return <OBJModel url={url} />;
  if (ext === "ply") return <PLYModel url={url} />;
  return null;
}

function MeshViewer({ file, ext }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);

  return (
    <div className="h-[70vh] overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900 to-black shadow-2xl">
      <Canvas camera={{ position: [4, 3, 5], fov: 45 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 6, 4]} intensity={1.8} />
        <directionalLight position={[-4, 3, -5]} intensity={0.6} />
        <gridHelper args={[10, 10]} />
        <axesHelper args={[2]} />
        <Suspense fallback={<Html center><div className="rounded-xl bg-black/70 px-4 py-2 text-sm">Loading model...</div></Html>}>
          <Bounds fit clip observe margin={1.2}>
            <Center>
              <MeshModel url={url} ext={ext} />
            </Center>
          </Bounds>
        </Suspense>
        <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
      </Canvas>
    </div>
  );
}

function DwgDxfPlaceholder({ ext }) {
  return (
    <div className="flex h-[70vh] items-center justify-center rounded-3xl border border-white/10 bg-zinc-950 p-8 shadow-2xl">
      <div className="max-w-xl text-center">
        <FileCode2 className="mx-auto h-14 w-14 text-zinc-400" />
        <h2 className="mt-5 text-2xl font-semibold uppercase">{ext} viewer scaffold ready</h2>
        <p className="mt-3 text-zinc-300">
          This branch is where mlightcad/cad-viewer will be integrated for DWG/DXF rendering. The website already detects the format and routes it separately.
        </p>
        <div className="mt-6 rounded-2xl bg-white/5 p-4 text-left text-sm text-zinc-300">
          Next implementation target: create a dedicated <code className="text-white">DwgViewer.jsx</code> component and mount the mlightcad canvas inside this panel.
        </div>
      </div>
    </div>
  );
}

function FutureCadPlaceholder({ ext }) {
  return (
    <div className="flex h-[70vh] items-center justify-center rounded-3xl border border-amber-400/20 bg-amber-950/20 p-8 shadow-2xl">
      <div className="max-w-xl text-center">
        <AlertTriangle className="mx-auto h-14 w-14 text-amber-300" />
        <h2 className="mt-5 text-2xl font-semibold">Server conversion needed</h2>
        <p className="mt-3 text-zinc-300">
          Files like {ext.toUpperCase()} usually need backend conversion to GLB before browser viewing. This will be Phase 2 using OpenCascade or a cloud CAD API.
        </p>
      </div>
    </div>
  );
}

function UnknownPlaceholder({ ext }) {
  return (
    <div className="flex h-[70vh] items-center justify-center rounded-3xl border border-red-400/20 bg-red-950/20 p-8 shadow-2xl">
      <div className="max-w-xl text-center">
        <AlertTriangle className="mx-auto h-14 w-14 text-red-300" />
        <h2 className="mt-5 text-2xl font-semibold">Unsupported format</h2>
        <p className="mt-3 text-zinc-300">
          The website does not know how to open .{ext || "unknown"} yet. Add this format to the routing table when you choose a loader/converter.
        </p>
      </div>
    </div>
  );
}

function ViewerRouter({ file, onReset }) {
  const ext = getExtension(file.name);
  const category = getFileCategory(ext);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <main>
        {category === "mesh" && <MeshViewer file={file} ext={ext} />}
        {category === "cad2d" && <DwgDxfPlaceholder ext={ext} />}
        {category === "future" && <FutureCadPlaceholder ext={ext} />}
        {category === "unknown" && <UnknownPlaceholder ext={ext} />}
      </main>
      <FileInfo file={file} ext={ext} category={category} onReset={onReset} />
    </div>
  );
}

function FeatureCard({ icon: Icon, title, text }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-xl">
      <Icon className="h-6 w-6 text-zinc-300" />
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-400">{text}</p>
    </div>
  );
}

export default function App() {
  const [file, setFile] = useState(null);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(120,119,198,0.22),transparent_30%)]" />

      <header className="relative mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-white p-2 text-black">
            <Box className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight">CADScope</span>
        </div>
        <div className="hidden rounded-full border border-white/10 px-4 py-2 text-sm text-zinc-300 md:block">
          Local-first CAD viewer MVP
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl px-6 pb-12">
        {!file ? (
          <>
            <section className="py-12 text-center md:py-20">
              <div className="mx-auto mb-5 flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-300">
                <Sparkles className="h-4 w-4" /> Browser-based CAD and 3D viewer
              </div>
              <h1 className="mx-auto max-w-4xl text-5xl font-black tracking-tight md:text-7xl">
                Open engineering files directly on the web.
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-zinc-300 md:text-lg">
                A clean MVP for viewing 3D mesh files now, routing DWG/DXF separately, and preparing heavy CAD formats for backend conversion later.
              </p>
            </section>

            <DropZone onFile={setFile} />

            <section className="mt-8 grid gap-4 md:grid-cols-3">
              <FeatureCard icon={Box} title="3D mesh viewing" text="GLB, GLTF, STL, OBJ, and PLY load locally using Three.js." />
              <FeatureCard icon={FileCode2} title="DWG/DXF route" text="2D CAD files are detected and reserved for mlightcad integration." />
              <FeatureCard icon={Layers3} title="CAD conversion path" text="STEP, Inventor, SolidWorks, CATIA, and others can be added through backend conversion." />
            </section>
          </>
        ) : (
          <ViewerRouter file={file} onReset={() => setFile(null)} />
        )}
      </main>
    </div>
  );
}
