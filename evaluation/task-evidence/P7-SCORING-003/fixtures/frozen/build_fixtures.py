"""Build offline benchmark inputs and reference drafts; never call a model API.

Requires the development environment's matplotlib and Pillow. Existing generated
manifests are never overwritten; use --output for a separate candidate revision.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]


def specification(category, representation, domain, kind, x, values, context,
                  x_label, y_label, facts, alt, sensitive=True):
    return dict(category=category, representation=representation, domain=domain,
                kind=kind, x=x, values=values, context=context,
                x_label=x_label, y_label=y_label, facts=facts, alt=alt,
                context_sensitive=sensitive)


# These reference expectations are drafts for the author's review, not model results.
HELD_OUT = [
    specification("missing-empty", "markdown", "Building energy use", "line",
                  [1, 2, 3, 4], [12, 16, 20, 24],
                  "The observations measure daily building energy consumption in kilowatt-hours (kWh), ordered from day 1 to day 4.",
                  "Day", "Energy (kWh)",
                  ["A line chart.", "Daily building energy consumption in kWh.", "Energy use increases across all four days."], None),
    specification("missing-empty", "markdown", "Water sample volumes", "bar",
                  ["A", "B", "C"], [18, 30, 12],
                  "The three containers A, B, and C hold water samples; volumes are measured in liters.",
                  "Container", "Volume (liters)",
                  ["A bar chart.", "Water sample volumes in liters.", "Container B has the greatest volume.", "Container C has the smallest volume."], "", False),
    specification("missing-empty", "code-output", "Query latency", "line",
                  [1, 2, 3, 4], [240, 200, 160, 120],
                  "Each point measures the latency of one query execution in a synthetic trial, rather than cumulative processing time. The vertical axis shows query latency in milliseconds. The horizontal axis numbers four successive query executions; collection times and intervals are not specified.",
                  "Observation", "Latency (ms)",
                  ["A line chart.", "Query latency measured in milliseconds.", "Latency decreases across the four observations."], None),
    specification("missing-empty", "code-output", "Collected sample counts", "bar",
                  ["A", "B", "C"], [8, 20, 12],
                  "A, B, and C identify collection sites. Values are the number of samples collected at each site.",
                  "Site", "Samples (count)",
                  ["A bar chart.", "Counts of collected samples by site.", "Site B has the highest count.", "Site A has the lowest count."], ""),
    specification("missing-empty", "code-output", "Rainfall and runoff", "scatter",
                  [1, 2, 3, 4], [2, 4, 5, 8],
                  "Each point represents a separate synthetic rainfall event. The horizontal axis shows total rainfall for that event in millimeters, and the vertical axis shows the corresponding total runoff volume in liters. These observations do not establish causation.",
                  "Rainfall (mm)", "Runoff (liters)",
                  ["A scatter plot.", "Rainfall in millimeters versus runoff in liters.", "Higher rainfall is associated with greater runoff in these observations."], None, False),
    specification("missing-empty", "code-output", "Battery charge", "line",
                  [1, 2, 3, 4], [90, 70, 50, 30],
                  "All four points measure the same battery during one synthetic discharge session. The vertical axis shows remaining battery charge as a percentage. The horizontal axis numbers measurements in chronological order; elapsed times and intervals between measurements are not specified.",
                  "Observation", "Charge (%)",
                  ["A line chart.", "Remaining battery charge as a percentage.", "Charge decreases steadily across the observations."], ""),
    specification("weak", "markdown", "Helpdesk ticket counts", "bar",
                  ["A", "B", "C"], [24, 12, 6],
                  "A, B, and C identify helpdesk queues. Each value is a count of tickets received during one synthetic observation period.",
                  "Queue", "Tickets (count)",
                  ["A bar chart.", "Ticket counts across helpdesk queues.", "Queue A has the highest count.", "Queue C has the lowest count."], "chart"),
    specification("weak", "markdown", "Irrigation demand", "line",
                  [1, 2, 3, 4], [5, 10, 15, 20],
                  "Daily irrigation water demand is measured in liters over four consecutive days.",
                  "Day", "Demand (liters)",
                  ["A line chart.", "Daily irrigation demand in liters.", "Demand increases across all four days."], "plot", False),
    specification("weak", "markdown", "Walking duration and distance", "scatter",
                  [10, 20, 30, 40], [1, 2, 3, 4],
                  "Each point records progress during one synthetic walk. The horizontal axis shows elapsed time since the walk began, in minutes. The vertical axis shows cumulative distance traveled since the walk began, in kilometers.",
                  "Duration (minutes)", "Distance (km)",
                  ["A scatter plot.", "Elapsed walking time in minutes versus cumulative distance in kilometers during one walk.", "Cumulative distance increases as the walk progresses."], "data"),
    specification("weak", "code-output", "Queue waiting time", "line",
                  [1, 2, 3, 4], [30, 24, 18, 12],
                  "Each point measures how long one job waited in a processing queue before processing began, rather than accumulated waiting time across jobs. The vertical axis shows that job's waiting time in seconds. The horizontal axis numbers four jobs in order of observation; collection timestamps and intervals are not specified.",
                  "Observation", "Waiting time (seconds)",
                  ["A line chart.", "Processing queue waiting time in seconds.", "Waiting time decreases steadily across the observations."], "line chart"),
    specification("weak", "code-output", "Parcel counts", "bar",
                  ["A", "B", "C"], [14, 28, 7],
                  "A, B, and C identify depots. Values are parcel counts for one synthetic collection period.",
                  "Depot", "Parcels (count)",
                  ["A bar chart.", "Parcel counts across depots.", "Depot B has the highest count.", "Depot C has the lowest count."], "bars", False),
    specification("weak", "code-output", "Input size and execution time", "scatter",
                  [1, 2, 3, 4], [1, 3, 5, 7],
                  "Each point represents a separate execution of a synthetic workload. The horizontal axis shows the input size for that execution in megabytes, and the vertical axis shows its execution duration in seconds. Durations are not accumulated across executions.",
                  "Input size (MB)", "Execution time (seconds)",
                  ["A scatter plot.", "Input size in megabytes versus execution time in seconds.", "Larger inputs are associated with longer execution times."], "scatter plot"),
    specification("acceptable", "markdown", "Reservoir level", "line",
                  [1, 2, 3, 4], [20, 30, 40, 50],
                  "The vertical axis shows reservoir water level in centimeters above a fixed local reference. The horizontal axis numbers four observations in chronological order; observation times and intervals are not specified.",
                  "Observation", "Level (cm)",
                  ["A line chart.", "Reservoir water level in centimeters.", "The level increases steadily across the four observations."],
                  "Line chart showing reservoir water level increasing steadily from 20 to 50 centimeters across four observations."),
    specification("acceptable", "markdown", "Laboratory sample counts", "bar",
                  ["A", "B", "C"], [6, 18, 12],
                  "A, B, and C identify laboratory stations. Values are counts of processed samples.",
                  "Station", "Samples (count)",
                  ["A bar chart.", "Processed laboratory sample counts by station.", "Station B has the highest count.", "Station A has the lowest count."],
                  "Bar chart of processed laboratory sample counts for stations A, B, and C, with B highest and A lowest.", False),
    specification("acceptable", "markdown", "Reading duration and pages", "scatter",
                  [5, 10, 15, 20], [2, 4, 6, 8],
                  "Each point records progress during one synthetic reading session. The horizontal axis shows elapsed time since the session began, in minutes. The vertical axis shows the cumulative number of pages completed by that time.",
                  "Duration (minutes)", "Pages (count)",
                  ["A scatter plot.", "Elapsed reading time in minutes versus cumulative completed page count in one session.", "Cumulative completed pages increase as the session progresses."],
                  "Scatter plot showing more pages completed at longer reading durations, from two pages at five minutes to eight pages at twenty minutes."),
    specification("acceptable", "code-output", "Test throughput", "line",
                  [1, 2, 3, 4], [10, 20, 30, 40],
                  "The vertical axis shows synthetic test throughput in jobs per minute. The horizontal axis numbers four successive observations; collection times and intervals are not specified.",
                  "Observation", "Throughput (jobs/minute)",
                  ["A line chart.", "Test throughput in jobs per minute.", "Throughput increases steadily across four observations."],
                  "Line chart showing test throughput increasing steadily from 10 to 40 jobs per minute across four observations."),
    specification("acceptable", "code-output", "Stored item counts", "bar",
                  ["A", "B", "C"], [15, 5, 10],
                  "A, B, and C identify storage bins. Values are counts of stored items.",
                  "Bin", "Items (count)",
                  ["A bar chart.", "Stored item counts across bins.", "Bin A has the highest count.", "Bin B has the lowest count."],
                  "Bar chart comparing stored item counts across bins A, B, and C, with A highest at 15 and B lowest at 5.", False),
    specification("acceptable", "code-output", "Payload size and transfer duration", "scatter",
                  [1, 2, 3, 4], [2, 4, 6, 8],
                  "Each point represents a separate synthetic transfer over a fixed link. The horizontal axis shows the payload size for that transfer in megabytes, and the vertical axis shows its transfer duration in seconds. Durations are not accumulated across transfers.",
                  "Payload size (MB)", "Duration (seconds)",
                  ["A scatter plot.", "Payload size in megabytes versus transfer duration in seconds.", "Larger payloads are associated with longer transfer durations."],
                  "Scatter plot showing transfer duration increasing with payload size, from two seconds for one megabyte to eight seconds for four megabytes."),
]


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def image_hash(payload):
    value = 5381
    for char in payload:
        value = ((value * 33) + ord(char)) & 0xffffffff
    return format(value, "x")


def markdown(source, cell_id):
    return dict(cell_type="markdown", id=cell_id, metadata={}, source=source)


def code(source, cell_id):
    return dict(cell_type="code", id=cell_id, execution_count=None,
                metadata={}, outputs=[], source=source)


def plot_source(spec):
    sensitive = spec["context_sensitive"]
    x_label = ("X" if spec["kind"] == "scatter" else "Observation") if sensitive else spec["x_label"]
    y_label = "Value" if sensitive else spec["y_label"]
    title = "Measurements" if sensitive else spec["domain"]
    draw = {
        "line": 'ax.plot(x, values, marker="o", color="#1764ab")',
        "bar": 'ax.bar(x, values, color="#1764ab")',
        "scatter": 'ax.scatter(x, values, color="#1764ab", s=65)',
    }[spec["kind"]]
    return "\n".join([
        "import matplotlib.pyplot as plt",
        'plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10})',
        f'x = {spec["x"]!r}', f'values = {spec["values"]!r}',
        "fig, ax = plt.subplots(figsize=(6.4, 4))", draw,
        f"ax.set_title({title!r})", f"ax.set_xlabel({x_label!r})",
        f"ax.set_ylabel({y_label!r})", "ax.set_ylim(bottom=0)",
        'ax.grid(axis="y", alpha=0.25)', "ax.set_axisbelow(True)",
        "fig.tight_layout()", "plt.show()",
    ])


def render(source):
    # Only execute the generated plotting source, never the existing dev notebook.
    namespace = {}
    exec(source.replace("plt.show()", ""), namespace)
    buffer = io.BytesIO()
    namespace["fig"].savefig(buffer, format="png", dpi=100,
                             metadata={"Software": "A11yLens benchmark builder"})
    plt.close(namespace["fig"])
    return buffer.getvalue()


def make_case(output, number, split, spec, raw_image, source, provenance=None):
    key = f"case-{number:02d}"
    asset_path = f"assets/{key}.png"
    image_path = output / asset_path
    image_path.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(io.BytesIO(raw_image)) as image:
        image.verify()
    image_path.write_bytes(raw_image)

    if spec["representation"] == "markdown":
        if spec["alt"] is None:
            current = markdown(f'<img src="../{asset_path}">', "figure")
            source_type = "markdown-html"
        else:
            current = markdown(f'![{spec["alt"]}](../{asset_path})', "figure")
            source_type = "markdown-inline"
    else:
        current = code(source, "figure")
        payload = base64.b64encode(raw_image).decode("ascii")
        current["outputs"] = [dict(output_type="display_data",
                                   data={"image/png": payload}, metadata={})]
        if spec["alt"] is not None:
            current["metadata"] = {"a11y_metadata": {"outputs": {
                "0": {"dataHash": image_hash(payload), "altText": spec["alt"]}
            }}}
        source_type = "code-output"

    # The essential narrative is outside a +/-2 window, but within the section.
    notebook_cells = [
        markdown(f'# {spec["domain"]}', "section"),
        markdown(spec["context"], "description"),
        code(f'sample_count = {len(spec.get("values", []))}', "sample-count"),
        code("display_scale = 1", "display-scale"),
        current,
        markdown("# Separate inventory study", "other-section"),
        markdown("In a separate inventory exercise, shelf counts were 7 and 11. These observations belong to the inventory study.", "other-description"),
    ]
    notebook = dict(cells=notebook_cells, metadata={
        "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
        "language_info": {"name": "python"},
    }, nbformat=4, nbformat_minor=5)
    notebook_path = f"{split}/{key}.ipynb"
    write_json(output / notebook_path, notebook)

    record = dict(
        id=key, split=split, category=spec["category"],
        sourceType=source_type, notebookPath=notebook_path, imagePath=asset_path,
        cellIndex=4, contextCellIndices=[0, 1],
        contextSensitive=spec["context_sensitive"],
        expectedAltState="missing" if spec["alt"] is None else "empty" if spec["alt"] == "" else "present",
        shouldImprove=spec["category"] != "acceptable",
        requiredFacts=spec["facts"],
        prohibitedClaims=[
            "Invented causes, forecasts, or conclusions beyond the displayed observations.",
            "Unshown measurements or numeric values inconsistent with the plotted data.",
            "Treating the separate inventory study as the subject of this image.",
        ],
        evidence={
            "context": spec["context"],
            "image": "Chart geometry and labeled axes; source values are recorded below when available.",
            "sourceValues": spec.get("values", []),
            "sourceX": spec.get("x", []),
        }, annotationStatus="draft",
    )
    if source_type == "code-output":
        record["outputIndex"] = 0
    if spec["alt"] is not None:
        record["existingAltText"] = spec["alt"]
    if provenance:
        record["provenance"] = provenance
    return record


def development_specs():
    source_path = ROOT / "test_files/dev_benchmark_cases.ipynb"
    original = json.loads(source_path.read_text())
    for index in range(1, 7):
        cell = original["cells"][index]
        source = cell["source"]
        source = "".join(source) if isinstance(source, list) else source
        if index == 4:
            payload = cell["outputs"][0]["data"]["image/png"]
            payload = "".join(payload) if isinstance(payload, list) else payload
            raw_image = base64.b64decode(payload)
            spec = specification("weak", "code-output", "Customer ages", "histogram",
                [], [22, 25, 29, 31, 34, 28, 45, 52, 27, 33],
                "The histogram summarizes customer ages in years from ten synthetic observations.",
                "Age", "Count",
                ["A histogram.", "Customer ages in years.", "Most observations lie between ages 22 and 34."],
                cell["metadata"]["a11y_metadata"]["altText"], False)
        elif index == 6:
            payload = cell["outputs"][0]["data"]["image/png"]
            payload = "".join(payload) if isinstance(payload, list) else payload
            raw_image = base64.b64decode(payload)
            spec = specification("acceptable", "code-output", "Department enrollment", "bar",
                ["CS", "Bio", "Math", "History"], [1200, 850, 600, 400],
                "The chart compares 2026 department enrollment. CS means Computer Science; counts represent students.",
                "Department", "Students",
                ["A bar chart.", "2026 department enrollment.", "Computer Science has the highest enrollment."],
                cell["metadata"]["a11y_metadata"]["altText"], False)
        else:
            raw_image = (ROOT / "test_files/sales_chart.png").read_bytes()
            alt = None if index == 1 else "" if index == 2 else "graph" if index == 3 else "Line chart showing quarterly revenue increasing steadily across five quarters."
            category = "missing-empty" if index in (1, 2) else "weak" if index == 3 else "acceptable"
            spec = specification(category, "markdown", "Quarterly revenue", "line",
                ["Q1", "Q2", "Q3", "Q4", "Q5"], [12, 18, 24, 31, 40],
                "The chart shows quarterly revenue in thousands of dollars across five consecutive quarters.",
                "Quarter", "Revenue ($k)",
                ["A line chart.", "Quarterly revenue.", "Revenue increases across five quarters."], alt, False)
        neutral_source = "\n".join(line for line in source.splitlines()
                                   if not line.startswith("# Case "))
        yield index, spec, raw_image, neutral_source, {
            "notebook": "test_files/dev_benchmark_cases.ipynb", "cellIndex": index,
            "note": "Standalone neutral-context derivative; original manual notebook is unchanged.",
        }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parent)
    args = parser.parse_args()
    output = args.output.resolve()
    if (output / "references/manifest.json").exists():
        raise SystemExit("Refusing to overwrite benchmark inputs. Use --output for a separate revision.")

    records = [make_case(output, number, "development", spec, image, source, provenance)
               for number, spec, image, source, provenance in development_specs()]
    for number, spec in enumerate(HELD_OUT, 7):
        source = plot_source(spec)
        records.append(make_case(output, number, "held-out", spec, render(source), source))

    manifest = dict(schemaVersion=1, annotationStatus="draft",
                    description="Synthetic controlled benchmark; no model calls made by this builder.",
                    cases=records)
    write_json(output / "references/manifest.json", manifest)
    files = sorted([*output.glob("assets/*.png"), *output.glob("development/*.ipynb"),
                    *output.glob("held-out/*.ipynb"), output / "references/manifest.json"])
    freeze = dict(schemaVersion=1, status="pending-author-review", caseCount=len(records),
                  note="Integrity snapshot only. Author review is required before declaring the benchmark frozen.",
                  files={str(path.relative_to(output)): hashlib.sha256(path.read_bytes()).hexdigest()
                         for path in files})
    write_json(output / "references/freeze.json", freeze)
    print(f"Prepared {len(records)} cases with reference drafts and SHA-256 hashes in {output}")


if __name__ == "__main__":
    main()
