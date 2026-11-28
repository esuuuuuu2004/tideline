# Taluksangay field-flood calibration (initial, low confidence)

## Scope and sources

The observations below are supplied by the field operator. They are field observations, not tide-gauge readings. Tide extrema for November 27 through December 3, 2026 are the supplied TideCharts predictions (PHT, GMT+8); this file does not extend or alter that dataset.

For a rolling forecast, the app uses Open-Meteo's Marine API `sea_level_height_msl` hourly series. It is a model sea-level forecast that includes tides and other sea-level effects, not a live gauge. It currently resolves Taluksangay to a marine grid point near 6.875, 122.208 (about 8 km from the requested coordinate). The service advertises up to eight forecast days; its marine sea-level products have coastal-resolution and coastal-accuracy limits. The app must stop at the returned horizon and refresh for later data rather than extrapolate.

Source references:

- [Open-Meteo Marine API documentation](https://open-meteo.com/en/docs/marine-weather-api)
- [Open-Meteo terms](https://open-meteo.com/en/terms) and [data licence](https://open-meteo.com/en/license)
- The no-key free API is restricted to non-commercial use; commercial use requires a subscription. Attribution is required under CC BY 4.0.

## TideCharts curve approximation for the supplied observations

The supplied extrema bracketing the observations are the November 27 12:46 PM low at -0.17 m and 7:52 PM high at 1.39 m. Their interval is 426 minutes and their range is 1.56 m. Since the sampled TideCharts curve was not supplied, heights here use a raised-cosine interpolation between those two extrema:

```text
t = minutes since 12:46 PM / 426
h(t) = -0.17 + (1.56 / 2) * (1 - cos(pi * t))
```

| PHT observation time | TideCharts-curve estimate | Field observation |
| --- | ---: | --- |
| 5:13 PM | 0.912 m | Already unplayable; coverage had crossed 35%. |
| 5:26 PM | 0.980 m | Approximately half covered. |
| 5:50 PM | 1.095 m | Entire field covered. |
| 6:40 PM | 1.283 m | Water still rising; no coverage percentage supplied. |
| Around 7:20 PM | 1.368 m | Water observed receding; time is approximate and no coverage percentage supplied. |

The first observation is a lower bound (`coverage >= 35%`), not an exact 35% calibration point. The 5:26 and 5:50 percentages are approximate/observed bounds. The last two observations only describe direction; they are not coverage anchors.

## Independent Open-Meteo series check for November 27

The app's rolling source was queried at the station coordinates with `past_days=1` during the supplied observation window. It resolved to the marine grid point above. The source's hourly MSL sea-level values were 1.24 m at 5 PM, 1.57 m at 6 PM, 1.73 m at 7 PM, and 1.67 m at 8 PM. Linear interpolation within each hourly pair gives:

| PHT observation time | Open-Meteo model estimate | Use in initial model |
| --- | ---: | --- |
| 5:13 PM | 1.312 m | Rising-branch lower-bound anchor: coverage was at least 35%. |
| 5:26 PM | 1.383 m | Rising-branch approximate 50% anchor. |
| 5:50 PM | 1.515 m | Rising-branch 100% anchor. |
| 6:40 PM | 1.663 m | Direction-only check; the model is still rising. |
| Around 7:20 PM | 1.710 m | Direction-only check; interpolated source slope is falling. |

These MSL model heights and the TideCharts-curve heights differ materially. They have distinct prediction sources/datum behavior and must not be combined as if they were one measured curve. The available source series peaks around 7 PM and is falling by 7:20 PM, while supplied TideCharts data predicts a 7:52 PM high. The operator's approximate recession report agrees in direction with the former, but a single approximate direction observation cannot validate either model's timing or level.

## Initial coverage mapping and assumptions

The runtime model uses the Open-Meteo series consistently, rather than applying TideCharts heights directly to an MSL series:

- 0% at the November 27 Open-Meteo low of -0.22 m is an explicit dry-at-low assumption; no dry-at-low observation was supplied.
- 35% at 1.312 m is a lower-bound calibration: the field was already beyond the unplayable threshold at that time.
- Approximately 50% at 1.383 m and 100% at 1.515 m are approximate empirical anchors.
- Between anchors the initial curve is piecewise linear and clamped to 0–100%. No observations support a more complex fit.
- The same level thresholds are used while falling. Coverage therefore remains saturated until the predicted level falls below the full-coverage anchor; it does not become dry just because the tide turns. There is no independent measured drainage delay to fit, so the model does not invent a number of lag minutes.
- The around-7:20 PM observation is retained as an approximate falling-direction record only. It is not changed to match TideCharts and does not set a coverage value.
- The supplied observations and their paired Open-Meteo model levels are the source-managed calibration records. Adding a later field report with a paired level to `src/data/field-flood-calibration.ts` automatically adds its coverage point to the rising calibration curve. The app does not yet have a field-observation submission feed or live field sensor.

The model is a low-confidence visual estimate. One rising cycle, no exact dry observation, approximate coverage reports, source disagreement, coastal grid resolution, and absent falling-coverage measurements prevent a scientifically validated or safety-grade relationship. When forecast samples are missing, the UI must show coverage/status unavailable rather than carry forward or invent a value. Any calculated playable message remains an estimated status, not a safety guarantee.

## Supplied TideCharts baseline

The supplied extrema for Nov 27–Dec 3 are preserved as the initial historical reference in the app's local calibration data. They end on Dec 3; that is not an operational end date. The rolling Marine API forecast supersedes them for current/future predictions and only covers the provider-returned horizon.

| PHT date | Supplied low/high events |
| --- | --- |
| Nov 27 | 2:09 AM low -0.07 m; 7:17 AM high 0.51 m; 12:46 PM low -0.17 m; 7:52 PM high 1.39 m |
| Nov 28 | 2:51 AM low -0.01 m; 7:54 AM high 0.50 m; 1:26 PM low -0.15 m; 8:36 PM high 1.32 m |
| Nov 29 | 3:34 AM low 0.05 m; 8:37 AM high 0.51 m; 2:13 PM low -0.08 m; 9:23 PM high 1.21 m |
| Nov 30 | 4:20 AM low 0.11 m; 9:29 AM high 0.53 m; 3:08 PM low 0.01 m; 10:15 PM high 1.08 m |
| Dec 1 | 5:10 AM low 0.15 m; 10:37 AM high 0.57 m; 4:17 PM low 0.13 m; 11:15 PM high 0.93 m |
| Dec 2 | 6:05 AM low 0.18 m; 12:03 PM high 0.63 m; 5:51 PM low 0.22 m |
| Dec 3 | 12:26 AM high 0.80 m; 7:03 AM low 0.18 m; 1:32 PM high 0.74 m; 7:44 PM low 0.25 m |

The additional November 27 11:55 PM TideCharts note (falling; next low in 2 h 56 m; next high in 7 h 59 m) remains historical context only and is not a current reading.
