# Third-party notices

## Lucide bug icon — ISC License

The bug outline embedded in `src/swarm-widget.js` and adapted in `src/dom-defender.js` is derived from Lucide's bug icon at commit `8b7ea73aa37c32406048a48cb3e7c354dcafb2f3`. Adaptations concatenate SVG paths, separate canvas body and leg paths, animate the legs, and add a body fill. This icon geometry remains under the ISC License reproduced below; the project's MIT license applies to its original game and integration code.

Source: <https://github.com/lucide-icons/lucide/blob/8b7ea73aa37c32406048a48cb3e7c354dcafb2f3/icons/bug.svg>

License source: <https://github.com/lucide-icons/lucide/blob/8b7ea73aa37c32406048a48cb3e7c354dcafb2f3/LICENSE>

The historical license text is reproduced unchanged:

```text
ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

## Fizlet engine — MIT License

The game bundles the Fizlet engine by Chris Cooley (`vendor/fizlet/`, provenance in `vendor/fizlet/ORIGIN.json`). The game itself is all rights reserved (LICENSE); the engine stays under its MIT license:

```text
MIT License

Copyright (c) 2026 Chris Cooley

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

React is an optional external peer dependency. Build and test tools are development dependencies, retain their own licenses, and are not bundled into the distributed game. No third-party logo, site design, font, screenshot, or branded demonstration page is included in this package.
