# Current UI workflow and hardware integration limits

This version implements the operator-facing flow around the existing API:

1. Register a sample from the mission summary.
2. The app selects it and opens the body map so the astronaut/operator can enter symptoms and context for that sample.
3. The overview shows the newest sample record, its analysis and quality status, results when available, and caveats such as missing result, missing minutes-from-wake, or context notes.
4. The Samples screen is a read-only history/detail view. Results are displayed from the existing sample fields or `/samples/{id}/assay-results`; there is no manual result editor.

## Important integration boundary

The repository currently has no sensor transport, device protocol, or hardware connection. The UI therefore reports “waiting for sensor or laboratory result” for a registered sample with no result. It never calculates cortisol from raw optical signals or invents a measurement. A future adapter must document the sensor protocol, calibration data and assay method, then write validated results through the existing assay-results API. Sensor calibration examples in `calibrador/app_marte_biosensor.py` are demonstrative/synthetic, not validated clinical calibration.

Health status wording is intentionally limited to record and quality status; it is not a diagnosis or fitness-for-duty determination. Body-map colors represent self-reported symptom severity, not cortisol concentration or a medical finding.
