#!/usr/bin/env python3
"""
Whisper Bridge Script for OpenWispr
Handles local speech-to-text processing using OpenAI's Whisper model
"""

import sys
import json
import tempfile
import os
import argparse
from pathlib import Path
import whisper
import threading
import time
import requests

def load_model(model_name="base"):
    """Load Whisper model with error handling"""
    try:
        print(f"Loading Whisper model: {model_name}", file=sys.stderr)
        model = whisper.load_model(model_name)
        print(f"Model {model_name} loaded successfully", file=sys.stderr)
        return model
    except Exception as e:
        print(f"Error loading model: {e}", file=sys.stderr)
        return None

def get_expected_model_size(model_name):
    """Get expected file size for a model by checking the remote URL"""
    try:
        model_url = whisper._MODELS[model_name]
        response = requests.head(model_url, timeout=10)
        if response.status_code == 200:
            content_length = response.headers.get('content-length')
            if content_length:
                return int(content_length)
    except Exception as e:
        print(f"Could not get expected size for {model_name}: {e}", file=sys.stderr)
    
    # Fallback to approximate sizes (in bytes)
    approximate_sizes = {
        "tiny": 39 * 1024 * 1024,     # ~39MB
        "base": 74 * 1024 * 1024,     # ~74MB
        "small": 244 * 1024 * 1024,   # ~244MB
        "medium": 769 * 1024 * 1024,  # ~769MB
        "large": 1550 * 1024 * 1024,  # ~1550MB
        "turbo": 809 * 1024 * 1024    # ~809MB
    }
    return approximate_sizes.get(model_name, 100 * 1024 * 1024)  # Default 100MB

def monitor_download_progress(model_name, expected_size):
    """Monitor download progress by watching file size growth"""
    cache_dir = os.path.expanduser("~/.cache/whisper")
    model_url = whisper._MODELS[model_name]
    model_file = os.path.join(cache_dir, os.path.basename(model_url))
    
    # Create cache directory if it doesn't exist
    os.makedirs(cache_dir, exist_ok=True)
    
    last_size = 0
    last_update_time = time.time()
    stagnant_count = 0
    
    while True:
        try:
            current_size = 0
            if os.path.exists(model_file):
                current_size = os.path.getsize(model_file)
            
            current_time = time.time()
            
            # Only send updates if size changed or every 2 seconds
            if current_size != last_size or (current_time - last_update_time) >= 2:
                percentage = min((current_size / expected_size * 100) if expected_size > 0 else 0, 100)
                
                progress_data = {
                    "type": "progress",
                    "model": model_name,
                    "downloaded_bytes": current_size,
                    "total_bytes": expected_size,
                    "percentage": round(percentage, 1),
                    "speed_mbps": 0
                }
                
                # Calculate download speed if we have a previous measurement
                if last_size > 0 and current_time > last_update_time:
                    bytes_per_second = (current_size - last_size) / (current_time - last_update_time)
                    mbps = (bytes_per_second * 8) / (1024 * 1024)  # Convert to Mbps
                    progress_data["speed_mbps"] = round(mbps, 2)
                
                print(f"PROGRESS:{json.dumps(progress_data)}", file=sys.stderr)
                
                last_size = current_size
                last_update_time = current_time
                
                # Check if download is complete
                if current_size >= expected_size * 0.95:  # 95% threshold to account for slight size differences
                    print(f"Download appears complete: {current_size}/{expected_size} bytes", file=sys.stderr)
                    break
            
            # Check for stagnation (no progress for too long)
            if current_size == last_size:
                stagnant_count += 1
                if stagnant_count > 100:  # 10 seconds of no progress
                    print(f"Download may be stagnant, checking if complete...", file=sys.stderr)
                    if current_size > 0:
                        break  # Assume download is done
            else:
                stagnant_count = 0
                
        except Exception as e:
            print(f"Error monitoring progress: {e}", file=sys.stderr)
            
        time.sleep(0.1)  # Check every 100ms

def download_model(model_name="base"):
    """Download Whisper model with real-time progress monitoring"""
    try:
        print(f"Starting download of Whisper model: {model_name}", file=sys.stderr)
        
        # Check if model is already downloaded
        cache_dir = os.path.expanduser("~/.cache/whisper")
        model_url = whisper._MODELS[model_name]
        model_file = os.path.join(cache_dir, os.path.basename(model_url))
        
        if os.path.exists(model_file):
            file_size = os.path.getsize(model_file)
            print(f"Model {model_name} already exists ({file_size} bytes)", file=sys.stderr)
            return {
                "model": model_name,
                "downloaded": True,
                "path": model_file,
                "size_bytes": file_size,
                "size_mb": round(file_size / (1024 * 1024), 1),
                "success": True
            }
        
        # Get expected file size
        expected_size = get_expected_model_size(model_name)
        print(f"Expected size for {model_name}: {expected_size} bytes ({expected_size/(1024*1024):.1f} MB)", file=sys.stderr)
        
        # Start progress monitoring in background thread
        progress_thread = threading.Thread(
            target=monitor_download_progress, 
            args=(model_name, expected_size),
            daemon=True
        )
        progress_thread.start()
        
        # Start the actual download (this will block until complete)
        print(f"Initiating Whisper model download: {model_name}", file=sys.stderr)
        model = whisper.load_model(model_name)
        
        # Wait a moment for the progress thread to finish
        time.sleep(0.5)
        
        # Get final file info
        final_size = 0
        if os.path.exists(model_file):
            final_size = os.path.getsize(model_file)
        
        print(f"Download completed: {model_name} ({final_size} bytes)", file=sys.stderr)
        
        # Send final progress update
        final_progress = {
            "type": "progress",
            "model": model_name,
            "downloaded_bytes": final_size,
            "total_bytes": expected_size,
            "percentage": 100,
            "speed_mbps": 0
        }
        print(f"PROGRESS:{json.dumps(final_progress)}", file=sys.stderr)
        
        return {
            "model": model_name,
            "downloaded": True,
            "path": model_file,
            "size_bytes": final_size,
            "size_mb": round(final_size / (1024 * 1024), 1),
            "success": True
        }
        
    except Exception as e:
        print(f"Error downloading model: {e}", file=sys.stderr)
        return {
            "model": model_name,
            "downloaded": False,
            "error": str(e),
            "success": False
        }

def check_model_status(model_name="base"):
    """Check if a model is already downloaded"""
    try:
        cache_dir = os.path.expanduser("~/.cache/whisper")
        model_url = whisper._MODELS[model_name]
        model_file = os.path.join(cache_dir, os.path.basename(model_url))
        
        if os.path.exists(model_file):
            file_size = os.path.getsize(model_file)
            return {
                "model": model_name,
                "downloaded": True,
                "path": model_file,
                "size_bytes": file_size,
                "size_mb": round(file_size / (1024 * 1024), 1),
                "success": True
            }
        else:
            return {
                "model": model_name,
                "downloaded": False,
                "success": True
            }
    except Exception as e:
        return {
            "model": model_name,
            "error": str(e),
            "success": False
        }

def list_models():
    """List all available models and their download status"""
    models = ["tiny", "base", "small", "medium", "large", "turbo"]
    model_info = []
    
    for model in models:
        status = check_model_status(model)
        model_info.append(status)
    
    return {
        "models": model_info,
        "cache_dir": os.path.expanduser("~/.cache/whisper"),
        "success": True
    }

def delete_model(model_name="base"):
    """Delete a downloaded Whisper model"""
    try:
        print(f"Deleting Whisper model: {model_name}", file=sys.stderr)
        
        cache_dir = os.path.expanduser("~/.cache/whisper")
        model_url = whisper._MODELS[model_name]
        model_file = os.path.join(cache_dir, os.path.basename(model_url))
        
        if os.path.exists(model_file):
            file_size = os.path.getsize(model_file)
            os.remove(model_file)
            print(f"Model {model_name} deleted successfully ({file_size} bytes freed)", file=sys.stderr)
            return {
                "model": model_name,
                "deleted": True,
                "freed_bytes": file_size,
                "freed_mb": round(file_size / (1024 * 1024), 1),
                "success": True
            }
        else:
            print(f"Model {model_name} not found, nothing to delete", file=sys.stderr)
            return {
                "model": model_name,
                "deleted": False,
                "error": "Model not found",
                "success": False
            }
    except Exception as e:
        print(f"Error deleting model: {e}", file=sys.stderr)
        return {
            "model": model_name,
            "deleted": False,
            "error": str(e),
            "success": False
        }

def transcribe_audio(audio_path, model_name="base", language=None):
    """Transcribe audio file using Whisper"""
    try:
        # Load model
        model = load_model(model_name)
        if model is None:
            return {"error": "Failed to load Whisper model"}
        
        # Transcribe
        print(f"Transcribing audio file: {audio_path}", file=sys.stderr)
        
        # Set transcription options
        options = {}
        if language:
            options["language"] = language
            
        result = model.transcribe(audio_path, **options)
        
        # Return results
        return {
            "text": result["text"].strip(),
            "language": result.get("language", "unknown"),
            "segments": result.get("segments", []),
            "success": True
        }
        
    except Exception as e:
        print(f"Transcription error: {e}", file=sys.stderr)
        return {
            "error": str(e),
            "success": False
        }

def main():
    parser = argparse.ArgumentParser(description="Whisper Bridge for OpenScribe")
    parser.add_argument("--mode", default="transcribe", 
                       choices=["transcribe", "download", "check", "list", "delete"],
                       help="Operation mode (default: transcribe)")
    parser.add_argument("audio_file", nargs="?", help="Path to audio file to transcribe")
    parser.add_argument("--model", default="base", 
                       choices=["tiny", "base", "small", "medium", "large", "turbo"],
                       help="Whisper model to use (default: base)")
    parser.add_argument("--language", help="Language code (optional)")
    parser.add_argument("--output-format", default="json", 
                       choices=["json", "text"],
                       help="Output format (default: json)")
    
    args = parser.parse_args()
    
    # Handle different modes
    if args.mode == "download":
        result = download_model(args.model)
        print(json.dumps(result))
        return
    elif args.mode == "check":
        result = check_model_status(args.model)
        print(json.dumps(result))
        return
    elif args.mode == "list":
        result = list_models()
        print(json.dumps(result))
        return
    elif args.mode == "delete":
        result = delete_model(args.model)
        print(json.dumps(result))
        return
    elif args.mode == "transcribe":
        # Check if audio file exists
        if not args.audio_file:
            error_result = {"error": "Audio file required for transcription mode", "success": False}
            print(json.dumps(error_result))
            sys.exit(1)
            
        if not os.path.exists(args.audio_file):
            error_result = {"error": f"Audio file not found: {args.audio_file}", "success": False}
            print(json.dumps(error_result))
            sys.exit(1)
        
        # Transcribe
        result = transcribe_audio(args.audio_file, args.model, args.language)
        
        # Output results
        if args.output_format == "json":
            print(json.dumps(result))
        else:
            if result.get("success"):
                print(result.get("text", ""))
            else:
                print(f"Error: {result.get('error', 'Unknown error')}", file=sys.stderr)
                sys.exit(1)

if __name__ == "__main__":
    main() 