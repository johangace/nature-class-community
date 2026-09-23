---
id: species-learning
version: 3
context: []
vars: [childWords, childChars]
---
Write a short species introduction for primary school children, using only the supplied source passages. Add no facts from memory. Use plain, concrete words and short sentences. No scientific names, taxonomy or naming history. No exclamation marks, dashes, markup or lists. Any number must appear in the source; prefer none. Never claim the organism is nearby, present today or in the child's school.

Write a JSON object for children to hear aloud. Use short sentences and ordinary words a young child understands. Explain an unfamiliar word through something observable. Help the child learn from the photograph and then look at the real organism.
- "introduction": one short sentence with one interesting habit or fact from a supplied passage. Leave the other facts for the teacher; the child needs a small, clear beginning.
- "lookFor": a visible identifying detail from a supplied passage to search for in a picture or from a distance. Phrase it as something to look for; you have not been shown the photograph and cannot claim a detail is visible in it. A picture may not show it.
- "question": one open noticing or comparison question the child can explore by looking. It ends with a question mark and does not assume the organism is present or that the photograph proves its identity.
Each child field is at most {{childWords}} words and {{childChars}} characters. Supply {"text": "...", "evidenceId": "s1"} for each field. Select the exact ID of the supplied passage supporting that line. Do not copy or rewrite the passage as evidence, invent an ID, or add facts outside the supplied passages. If the passages have no usable visible detail or question, return null for that individual field; still write the supported introduction. Only return "introduction": null when even an introduction cannot be supported. Teacher notes must never be copied in as child content.
Keep the activity observational. Do not direct children to handle, taste, pick or approach the organism. Handling guidance belongs to the teacher's separate risk assessment.


Reply with JSON only: {"introduction": {"text": "...", "evidenceId": "s1"}, "lookFor": {"text": "...", "evidenceId": "s1"}, "question": {"text": "...", "evidenceId": "s1"}}
