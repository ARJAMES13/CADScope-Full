# CADScope

Browser-based CAD viewer for quick local preview of common CAD export files.

Live: https://cadscope.vercel.app/

## Overview

CADScope opens CAD export files directly in the browser without uploading them to a server. It is meant for quick inspection of lightweight geometry files when opening a full CAD package is unnecessary.

## Features

- Local file preview in the browser
- Supports STL, OBJ, PLY, GLB, GLTF and DXF
- Orbit, pan, zoom and reset-view controls
- Bounding-box dimension extraction for 3D models
- DXF entity parsing for 2D drawing preview
- Static frontend deployment on Vercel

## Tech Stack

- React
- Vite
- Three.js
- React Three Fiber
- Drei
- DXF Parser
- Vercel

## Project Relevance

This project focuses on browser-based CAD geometry handling, client-side mesh rendering, DXF parsing and lightweight engineering inspection workflows. It was built to understand practical limitations between directly renderable mesh/DXF formats and CAD-kernel-dependent formats such as STEP, B-Rep and native CAD files.

## Supported Formats

| Format | Type |
|---|---|
| STL | 3D mesh |
| OBJ | 3D mesh |
| PLY | 3D mesh |
| GLB / GLTF | 3D model |
| DXF | 2D CAD drawing |

## Run Locally

```bash
cd frontend
npm install
npm run dev
