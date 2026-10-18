# 第三方组件声明（THIRD-PARTY-NOTICES）

本作品为公开发布准备。页面运行期**不请求任何外部资源**（已用浏览器网络面板实测），
但仓库内**随包分发了**下列第三方代码，按许可证要求在此声明。

## three.js r0.184.0（MIT）

- 位置：`vendor/three/three.module.js`、`vendor/three/three.core.js`、`vendor/three/addons/**`
- 来源：npm 包 `three@0.184.0`，本地从 `E:\codexxx\cyberpunk-metropolis\node_modules\three` 复制而来
- 版权：Copyright © 2010-2026 Three.js Authors
- 许可证：MIT（各文件头部保留 `SPDX-License-Identifier: MIT` 与版权行）

```
The MIT License

Copyright © 2010-2026 three.js authors

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

## 其余内容

- 3D 几何、贴图、环境反射：**全部在运行期程序化生成**，无外部模型/贴图/HDR 文件。
- 字体：使用系统字体，不加载远程字体。
- 商标：品牌 `AURELIS`、机芯 `Calibre AU-07` 均为**虚构**，不代表任何真实厂商型号。

## 本作品自身的版权与许可

本作品源码以 **MIT License** 发布，见仓库根目录 `LICENSE`
（Copyright (c) 2026 hadigirard04-dev）。

注意：MIT 只覆盖本作品自身的代码；`vendor/three/**` 仍是 three.js 的 MIT 代码，
随包分发时需保留其版权与许可声明（见上文）。
