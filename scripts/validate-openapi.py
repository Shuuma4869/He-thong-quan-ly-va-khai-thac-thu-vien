"""Validate each published OpenAPI document, including schema and references."""
from pathlib import Path
import sys

import yaml
from openapi_spec_validator import OpenAPIV31SpecValidator

root = Path(__file__).resolve().parents[1]
failed = False
for path in sorted((root / "contracts" / "openapi").glob("*.yaml")):
    spec = yaml.safe_load(path.read_text(encoding="utf-8"))
    errors = list(OpenAPIV31SpecValidator(spec, base_uri=path.as_uri()).iter_errors())
    for error in errors:
        print(f"{path.name}: {'/'.join(map(str, error.path))}: {error.message}")
    print(f"{path.name}: {'FAIL' if errors else 'PASS'}")
    failed |= bool(errors)
sys.exit(int(failed))
