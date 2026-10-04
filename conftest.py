"""Pytest bootstrap for the Verify It backend.

Ensures the repository root is importable so tests can ``import backend`` no
matter which directory pytest is invoked from.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
