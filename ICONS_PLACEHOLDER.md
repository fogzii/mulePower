# Icon Files Needed

The extension requires three icon files:

- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels)  
- `icon128.png` (128x128 pixels)

## Option 1: Create Your Own Icons

Create PNG files with the above dimensions and save them in this directory.

## Option 2: Remove Icon References (Quick Testing)

If you want to test without icons, edit `manifest.json` and remove/comment out:

```json
"action": {
  "default_icon": { ... },  // Remove this section
  ...
},
"icons": { ... }  // Remove this section
```

## Option 3: Use Online Icon Generator

1. Visit: https://www.favicon-generator.org/
2. Upload any image (square recommended)
3. Download the generated icons
4. Rename to match the required names above

## Simple SVG to PNG Conversion

If you have an SVG or any image, you can use:
- GIMP (free)
- Photoshop
- Online converters like CloudConvert

The icon should represent betting/horse racing (e.g., 🏇 emoji, betting slip, or dashboard graphic).
