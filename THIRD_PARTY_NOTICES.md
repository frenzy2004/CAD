# PatchCAD third-party notices

PatchCAD is a noncommercial engineering prototype. This file records the CAD
software and research that it uses or credits. It does not replace the license
files distributed by the upstream projects.

## FreeCAD

The optional desktop add-on targets [FreeCAD](https://github.com/FreeCAD/FreeCAD).
PatchCAD does not redistribute the FreeCAD application. FreeCAD is licensed
under the [GNU Lesser General Public License, version 2.1 or later](https://github.com/FreeCAD/FreeCAD/blob/main/LICENSE).

Copyright belongs to the FreeCAD project and its contributors.

## Open CASCADE Technology

The browser CAD worker loads Open CASCADE Technology through the pinned
`replicad-opencascadejs` package. Open CASCADE Technology is licensed under the
[GNU Lesser General Public License, version 2.1](https://github.com/Open-Cascade-SAS/OCCT/blob/master/LICENSE_LGPL_21.txt)
with the [Open CASCADE exception, version 1.0](https://github.com/Open-Cascade-SAS/OCCT/blob/master/OCCT_LGPL_EXCEPTION.txt).
The exact WebAssembly runtime used by this repository is copied from the
lockfile-pinned package during the build; it is not downloaded at runtime.

Copyright belongs to OPEN CASCADE S.A.S. and the OCCT contributors.

## replicad

PatchCAD uses `replicad@0.23.1`, `replicad-opencascadejs@0.23.0`, and
`replicad-threejs-helper@0.23.0` from the
[replicad project](https://github.com/sgenoud/replicad). All three installed
packages contain the same MIT license:

> Copyright 2023 QuaroTech Sàrl
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the “Software”), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

## Text2CAD

[Text2CAD](https://github.com/SadilKhan/Text2CAD) and the NeurIPS 2024 paper
[“Text2CAD: Generating Sequential CAD Designs from Beginner-to-Expert Level
Text Prompts”](https://proceedings.neurips.cc/paper_files/paper/2024/file/0e5b96f97c1813bb75f6c28532c2ecc7-Paper-Conference.pdf)
are credited as research and product-design inspiration.

Text2CAD is licensed under
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
PatchCAD does not copy or ship Text2CAD source code, model weights, training
data, or generated CAD sequences. No endorsement by the Text2CAD authors or
DFKI is implied.

Text2CAD authors: Mohammad Sadil Khan, Sankalp Sinha, Talha Uddin Sheikh,
Didier Stricker, Sk Aziz Ali, and Muhammad Zeshan Afzal.
