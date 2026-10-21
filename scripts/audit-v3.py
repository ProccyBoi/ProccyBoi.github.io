#!/usr/bin/env python3
"""Run the independent v3 copy/isolation audit for the current experiment."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).resolve().parent / 'v3-webgpu/verify-isolation.py'), run_name='__main__')
