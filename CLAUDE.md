# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Breadboard is an Electron application for browsing, searching, and managing AI-generated images. It serves as a unified interface for viewing Stable Diffusion images from various sources with their metadata.

## Core Architecture

- **Main Process** (`main.js`): Electron app initialization, window management, and IPC handlers
- **Renderer Process**: Web-based UI served by the `breadmachine` package 
- **Preload Script** (`preload.js`): Secure bridge exposing limited Electron APIs to renderer
- **Configuration** (`breadboard.yaml`): Defines image source folders to monitor

### Key Dependencies

- `breadmachine`: Core functionality for image management and web server
- `electron-context-menu`: Right-click context menu functionality
- `electron`: Desktop app framework

### Window Management

The app uses a custom titlebar with overlay styling that adapts to light/dark themes. Multiple windows can be opened as popups, and windows can be pinned to stay on top.

### IPC Communication

Custom IPC handlers for:
- Theme switching across all windows
- Directory selection dialogs
- File system operations (opening folders)
- Window pinning/unpinning
- Debug console access

## Development Commands

```bash
# Install dependencies
npm install

# Start development server
npm start

# Build for testing (creates distributable in dist/)
npm run pack

# Build for production (all platforms)
npm run dist
```

## Configuration

Images are monitored from folders specified in `breadboard.yaml`. Default folders include:
- `~/invokeai/outputs` (InvokeAI)
- `~/.diffusionbee/images` (DiffusionBee)

## Distribution

The app builds for macOS, Windows, and Linux. macOS distribution includes a patch script (`script/patch.command`) to remove quarantine attributes after installation.