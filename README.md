# ReCo · TENS-Task dashboard demo

A preliminary interactive dashboard for discussion and feedback.

**[Open the demo](https://n-euclid.github.io/reco-tens-task-demo/)**

## Try it

Choose User 1–12, then drag a statement onto a score line or open its questionnaire and select a circle. Select the same circle again to clear it. Hover over a graph label to read its full statement. Week 4 and Week 8 are separate.

All users start unanswered. The twelve user slots are layout examples, not enrolled participants. Entered values are saved only in the visitor’s browser; this app has no server database or shared responses. Do not enter real participant data into this public demo.

The By user view preserves individual item responses. The experimental Across users view displays a subscale mean only after all three items have answers. That view and the final scale selection, task wording and scoring still need study-team review; this is a prototype, not a validated assessment or clinical system.

## Sources

The questionnaire text is taken from the [official METUX/TENS scales](https://selfdeterminationtheory.org/metux-scales/), TENS Task scale, PDF updated 21 November 2024. The short graph labels are display abbreviations. Bracketed task descriptions remain unfilled pending agreement on the intended task.

- Peters, D., Calvo, R. A., & Ryan, R. M. (2018). [Designing for Motivation, Engagement and Wellbeing in Digital Experience](https://doi.org/10.3389/fpsyg.2018.00797).
- Burnell, R., Peters, D., Ryan, R. M., & Calvo, R. A. (2023). [Technology evaluations are associated with psychological need satisfaction across different spheres of experience: an application of the METUX scales](https://doi.org/10.3389/fpsyg.2023.1092288).

Questionnaire materials remain subject to their authors’ rights and terms. This repository does not grant a separate licence to those materials. Bundled Quarto dependencies retain their existing notices.

## Edit and publish

- `index.qmd`: dashboard markup.
- `assets/outcomes-dashboard.js`: interaction, graph positioning and browser storage.
- `assets/outcomes-dashboard.css`: styling.
- `assets/tens-task-items.js`: statement definitions and short labels.
- `templates/reading-room.html`: HTML template.
- `docs/`: rendered site served by GitHub Pages from the main branch.

With Quarto installed, run:

```sh
quarto render index.qmd
python3 -m http.server 8000 --directory docs
```

Open `http://localhost:8000/` to preview. Commit both edited sources and the regenerated `docs/` files; pushing to `main` updates the demo.

This repository contains the dashboard only. Research protocols, emails, attachments, team photographs and saved responses are not included.
