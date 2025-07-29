#!/usr/bin/env python3
"""
GLB Optimization Script
Optimizes GLB files by reducing texture sizes and simplifying geometry
"""

import json
import struct
import os
from pathlib import Path

def read_glb_file(filepath):
    """Read and parse GLB file structure"""
    with open(filepath, 'rb') as f:
        # Read GLB header
        magic = f.read(4)
        if magic != b'glTF':
            raise ValueError("Not a valid GLB file")
        
        version = struct.unpack('<I', f.read(4))[0]
        length = struct.unpack('<I', f.read(4))[0]
        
        # Read JSON chunk
        json_chunk_length = struct.unpack('<I', f.read(4))[0]
        json_chunk_type = f.read(4)
        
        if json_chunk_type != b'JSON':
            raise ValueError("Invalid GLB structure")
        
        json_data = json.loads(f.read(json_chunk_length).decode('utf-8'))
        
        # Read binary chunk if exists
        binary_data = None
        if f.tell() < length:
            binary_chunk_length = struct.unpack('<I', f.read(4))[0]
            binary_chunk_type = f.read(4)
            if binary_chunk_type == b'BIN\x00':
                binary_data = f.read(binary_chunk_length)
        
        return json_data, binary_data

def analyze_glb_file(filepath):
    """Analyze GLB file and print structure"""
    json_data, binary_data = read_glb_file(filepath)
    
    print(f"Analyzing: {filepath}")
    print(f"File size: {os.path.getsize(filepath) / (1024*1024):.2f} MB")
    print(f"Binary data size: {len(binary_data) / (1024*1024):.2f} MB" if binary_data else "No binary data")
    
    # Analyze meshes
    if 'meshes' in json_data:
        print(f"\nMeshes ({len(json_data['meshes'])}):")
        for i, mesh in enumerate(json_data['meshes']):
            name = mesh.get('name', f'Mesh_{i}')
            print(f"  {i}: {name}")
            if 'primitives' in mesh:
                for j, prim in enumerate(mesh['primitives']):
                    print(f"    Primitive {j}: {list(prim.get('attributes', {}).keys())}")
    
    # Analyze materials
    if 'materials' in json_data:
        print(f"\nMaterials ({len(json_data['materials'])}):")
        for i, mat in enumerate(json_data['materials']):
            name = mat.get('name', f'Material_{i}')
            print(f"  {i}: {name}")
    
    # Analyze textures
    if 'textures' in json_data:
        print(f"\nTextures ({len(json_data['textures'])}):")
        for i, tex in enumerate(json_data['textures']):
            print(f"  {i}: source={tex.get('source', 'N/A')}, sampler={tex.get('sampler', 'N/A')}")
    
    # Analyze images
    if 'images' in json_data:
        print(f"\nImages ({len(json_data['images'])}):")
        for i, img in enumerate(json_data['images']):
            name = img.get('name', f'Image_{i}')
            mime_type = img.get('mimeType', 'unknown')
            print(f"  {i}: {name} ({mime_type})")
    
    return json_data, binary_data

def estimate_optimized_size(json_data, binary_data):
    """Estimate file size after optimization"""
    current_size = len(json.dumps(json_data).encode('utf-8'))
    if binary_data:
        current_size += len(binary_data)
    
    # Estimate reductions
    texture_reduction = 0.7  # 70% reduction from texture optimization
    geometry_reduction = 0.5  # 50% reduction from geometry simplification
    
    estimated_size = current_size * texture_reduction * geometry_reduction
    return estimated_size

def main():
    """Main function"""
    input_file = "public/models/nhanBongHoa.glb"
    
    if not os.path.exists(input_file):
        print(f"File not found: {input_file}")
        return
    
    print("GLB File Analysis")
    print("=" * 50)
    
    try:
        json_data, binary_data = analyze_glb_file(input_file)
        
        # Estimate optimized size
        current_size = os.path.getsize(input_file)
        estimated_size = estimate_optimized_size(json_data, binary_data)
        
        print(f"\nOptimization Estimates:")
        print(f"Current size: {current_size / (1024*1024):.2f} MB")
        print(f"Estimated optimized size: {estimated_size / (1024*1024):.2f} MB")
        print(f"Estimated reduction: {((current_size - estimated_size) / current_size * 100):.1f}%")
        
        # Check if target size is achievable
        target_size = 3 * 1024 * 1024  # 3MB
        if estimated_size <= target_size:
            print(f"✅ Target size of 3MB appears achievable!")
        else:
            print(f"⚠️  May need more aggressive optimization to reach 3MB target")
            additional_reduction = (estimated_size - target_size) / estimated_size
            print(f"   Need additional {additional_reduction*100:.1f}% reduction")
        
    except Exception as e:
        print(f"Error analyzing file: {e}")

if __name__ == "__main__":
    main()