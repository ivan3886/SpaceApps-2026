# Biomedical data model and MMASH readiness

The API now has storage primitives for saliva samples, assay results, and time-series streams. This is data-ingestion infrastructure, not a medical device integration, diagnostic algorithm, or evidence about astronaut physiology.

## Provenance and time

- Keep each sample's original `collected_at` instant and raw source time text.
- `time_basis` is `absolute`, `synthetic_date`, or `relative`. MMASH recordings that lack a real calendar date should use an explicitly documented synthetic UTC base date and `synthetic_date`; do not present that date as the participant's actual collection date.
- Store wake time and minutes since wake when known. Do not infer missing wake times. For records with a consistent dated UTC timeline, the importer should calculate elapsed minutes and validate that it is nonnegative.
- Keep the participant pseudonym and dataset participant ID; do not import names or direct identifiers.

## Assay results and units

`assay_results` is separate from the sample record so multiple analytes/results and repeats are representable. Store `value_original` and `unit_original` exactly as supplied. Normalized values and units are optional, separate fields; never overwrite source values or apply a conversion unless the analyte, method, and conversion are scientifically justified and documented. Store assay method, measurement time, detection limit, below-limit flag, dataset name, and source row key where available. A below-detection-limit result is not the same as zero or missing data.

## Sensor data

Create a `sensor_streams` record for each participant/session/signal, with source, units, timing basis, and optional sampling rate. Reading batches contain either a scalar value (for example RR intervals, in milliseconds) or all three accelerometer axes. `sequence_index` is unique per stream; repeated batch submissions are idempotent and duplicate sequence rows are ignored. Batches are limited to 5,000 readings; split larger CSV files into ordered chunks. RR intervals are raw intervals, not a derived HRV metric. HRV calculations should be separately named/versioned and preserve their window and quality criteria.

## API outline

- `POST /samples` and `PATCH /samples/{id}` accept wake and provenance fields.
- `POST /samples/{id}/assay-results`, `GET /samples/{id}/assay-results`
- `POST /sensor-streams`, `GET /sensor-streams`
- `POST /sensor-streams/{id}/readings/batch`, `GET /sensor-streams/{id}/readings`

Interactive documentation is available at `/docs` while the local API is running. The current HTML frontend has not yet been wired to enter or graph the new assay/sensor data; these endpoints are available for the future importer/UI.

## MMASH attribution and licensing

MMASH reference: https://physionet.org/content/mmash/1.0.0/ (DOI: 10.13026/cerq-fc86). Confirm the dataset page's current access and ODbL terms before sharing imported or derived data. Cite the source, retain licensing/attribution notices, and do not commit raw participant data to this repository. Dataset observations are for research/software testing, not astronaut-specific inference or clinical decisions.
