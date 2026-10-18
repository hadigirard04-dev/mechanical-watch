# AURELIS AU-07 · 机械腕表展示页

实时 WebGL 渲染的高端机械腕表展示页：**浮现 → 巡礼 → 分解 → 机芯 → 聚合 → 铭牌** 六幕滚动叙事。
全部画面由 Three.js 实时生成，**没有预渲染视频、没有贴图序列、没有用整图缩放冒充拆解**。

打开方式（本机已装 Node 与 Chrome）：

```powershell
cd E:\codexxx\mechanical-watch
node scripts/serve.cjs 8786        # 然后浏览器打开 http://127.0.0.1:8786/
```

> 端口可自选（本机 8766/8777/8789-8791/8818/8819 已被其他项目占用，故默认用 8786）。

也可以用任意静态服务器指向本目录；页面运行时**不请求任何外部资源**（three.js 与全部贴图都在本地，
贴图是运行期用 canvas 现画的）。

---

## 一、素材来源（重要）

| 内容 | 来源 |
| --- | --- |
| 3D 模型 | **全部程序化生成**，没有任何外部模型文件。表壳/表圈/表镜/盘面/指针/表耳/表冠用旋转体与挤压轮廓建模；齿轮用真·渐开线齿形公式现算；游丝与发条是阿基米德螺线扫掠体 |
| 贴图 | 运行期 canvas 绘制：太阳纹盘面、分钟轨道、日内瓦纹、珠圆纹、蓝钢螺钉一字槽、鳄鱼纹皮革、机芯铭文 |
| 环境反射 | 自建影棚 HDR 场景（柔光箱 + 侧光 + 顶光 + 背光）经 `PMREMGenerator` 烘焙，不是外部 HDR 文件 |
| 字体 | 系统字体（Segoe UI / Constantia / Microsoft YaHei 等），不加载远程字体 |
| three.js | r0.184.0，从本机已有安装复制到 `vendor/three/`（见下） |

`vendor/three/` 里的文件来自本机 `E:\codexxx\cyberpunk-metropolis\node_modules\three`
（npm 包 `three@0.184.0`），只复制了运行时真正用到的模块：

```
vendor/three/three.module.js, three.core.js
vendor/three/addons/postprocessing/{EffectComposer,RenderPass,ShaderPass,MaskPass,UnrealBloomPass,OutputPass,Pass}.js
vendor/three/addons/shaders/{CopyShader,LuminosityHighPassShader,OutputShader}.js
vendor/three/addons/environments/RoomEnvironment.js   （保留备用，当前未引用）
vendor/three/addons/utils/BufferGeometryUtils.js
```

品牌 `AURELIS`、型号 `Calibre AU-07` 均为**虚构**，不代表任何厂商型号。

## 二、动画与"零件独立控制"

- **开场**：镜头自 268 mm 处推进到 158 mm，灯光从 12% 升到 100%，盘面沿 12 点起顺时针做角度扫掠浮现
  （顶点着色器带出物体空间坐标 → 片元里按角度掩膜），12 枚立体时标按顺序升起，三根指针依次"生长"。
- **旋转**：腕表自身小幅自转 + 相机沿极坐标轨道环绕（方位角 −6°→348°、仰角 +9°→−10°），
  滚动量经 0.16 s 时间常数低通平滑，所以旋转是连续的而不是逐帧跳变。
- **分解**：43 个零件各自持有 `{方向, 距离, 旋转, 延迟, 时长}`，用滚动进度 `E` 逐件插值 —— 不是整体缩放。
  分离顺序：表镜 → 表圈 → 盘面 → 时针/分针/秒针 → 中框/表耳/表带 → 底盖 → 机芯内部（摆夹板 → 摆轮 → 游丝 →
  桥板 → 棘爪/擒纵 → 轮系 → 主夹板）。机芯内部沿机芯自身的轴分层展开。
- **聚合**：`E` 反向插值，同时把错峰压缩到 0.42 倍，所以"归位"比"分解"更紧凑。
- **机芯运转**：见下一节。齿轮在爆炸状态下仍在转，且各自转速与旋向独立。

## 三、传动（真值，可自检）

```
发条盒 88 齿 ──11 叶小齿轮──> 二番车 64 齿 ──8 叶──> 三番车 60 齿 ──8 叶──> 四番车 60 齿 ──5 叶──> 擒纵轮 20 齿
```

- 由齿数推导：二番车 1 转/小时、四番车 1 转/分钟、擒纵轮 720 转/小时；
  `720 × 20 齿 × 2 = 28 800 次/小时` 与摆轮 4 Hz（每秒 8 次）自洽。
- 相邻啮合**必然反向**（脚本里逐对校验）。
- 中心距严格等于 `模数 ×（齿数+齿数）/ 2`，啮合相位按解析式给出，所以齿是真正"咬"在一起的。
- 擒纵轮与擒纵小齿轮同轴，按拍跳齿（一拍前进 1/齿），摆轮 ±270° 往复，擒纵叉 ±4.6° 换向，
  游丝在顶点着色器里做与摆轮同步的"呼吸"（径向缩放，外端固定）。

自检（不依赖浏览器）：

```powershell
node scripts/check-train.mjs     # 8 项检查，报告写入 docs/train-check.txt
```

## 四、性能与质量分级

| 项 | 实测（1440×900，Chrome / 本机独显） |
| --- | --- |
| 帧率 | 165 fps（无上限运行）；降级阈值 42 fps |
| draw call | 253 |
| 三角面 | 210 k |
| 纹理 | 31 |
| 几何体 | 99 |
| 运行期网络请求 | 0（除页面自身文件） |

- 画质三档 `high / medium / low`（`?quality=low` 可强制），竖屏与移动端默认 `medium`。
- 帧率低于 42 fps 且非强制档时自动降级一次：像素比 → 移除泛光 → 尘埃减半 → 阴影贴图减半。
- 像素比上限 2（medium 1.5 / low 1），标签页隐藏时暂停渲染。
- `prefers-reduced-motion` 下关闭待机自转、手持抖动与颗粒动画。

## 五、交互

| 操作 | 效果 |
| --- | --- |
| 滚动 / ↑↓ / PageUp/Down / 空格 / Home | 推进或回退幕 |
| 左侧章节刻度 | 跳到任意一幕（含 `aria-current`） |
| 鼠标在画面上左右拖拽 | 给腕表附加旋转惯性，松手回弹 |
| 尾幕「探索机芯」 | 滚到第 4 幕（机芯特写） |
| 尾幕「切换真实节拍 ×1」 | 轮系从 ×60 展示倍速切到真值；读数表同步更新 |
| 尾幕「从头观看」 | 回到第 1 幕 |
| `D` 键 / `?debug=1` | 调试 HUD：fps、draw call、三角面、幕进度、爆炸系数 |

**关于"显示倍速"**：真实腕表的四番车 1 转/分钟、擒纵轮 1 转/5 秒，肉眼几乎看不出转动，
所以默认用 ×60 展示倍速（四番车 1 转/秒）；擒纵与摆轮另有显示限频（1.1 Hz），
**齿数比、旋向、中心距始终是真值**，读数表里"实际"与"显示"两列分开列出。

## 六、文件结构

```
mechanical-watch/
  index.html                 页面与六幕文案、机芯读数面板、CTA
  css/style.css              排版、HUD、响应式（≤900px 转竖屏布局）
  js/main.js                 渲染器/质量分级/交互/主循环/调试接口
  js/timeline.js             六幕时间轴：镜头、姿态、爆炸、浮现、后期参数（Catmull-Rom 轨道）
  js/scroll.js               DOM 章节 → 归一化幕位置，阻尼平滑与文案淡入淡出
  js/env.js                  影棚 HDR 环境、灯光、地面阴影、空气尘埃
  js/postfx.js               泛光 + 胶片质感（暗角/颗粒/色散/分离调色）+ 质量档
  js/watch/kinematics.js     渐开线数学（纯函数，可被 Node 引用）
  js/watch/gears.js          齿形轮廓、轮辐轮毂、擒纵轮、挤压工具
  js/watch/hull.js           凸包与凸多边形相交（桥板外形 + 碰撞校验）
  js/watch/dimensions.js     尺寸与层高（mm）
  js/watch/train.js          传动链、布局、相位、采样、自检
  js/watch/materials.js      材质与全部程序化贴图
  js/watch/movement.js       机芯几何（夹板/桥板/轮系/擒纵/条盒/宝石/螺钉）
  js/watch/parts.js          外观件几何（壳/圈/镜/盘/针/底盖/表冠/表耳/表带）
  js/watch/build-watch.js    总装 + 每个零件的爆炸运动学 + 传动驱动
  scripts/serve.cjs          本地静态服务器
  scripts/check-train.mjs    传动与布局自检
  scripts/capture.py         Playwright 截图与验收（桌面 + 竖屏 + 交互探测）
  vendor/three/              three.js r0.184.0 及所用 addons
  docs/train-check.txt       自检报告
  docs/log.md                开发日志与验收记录
  shots/                     截图与 report.json / report.txt
```

## 七、验收清单

```powershell
node scripts/check-train.mjs                     # 传动/布局 8 项自检
node scripts/serve.cjs 8786                      # 手动预览
python -B -X utf8 scripts/capture.py --mobile --probe   # 15 张截图 + 交互探测 + 性能读数
```

`shots/report.txt` 会给出每张截图路径、控制台错误数、帧率/draw call/三角面，以及
「点击探索机芯后幕位置是否前进」「倍速切换按钮文案是否变化」两项交互探测结果。

## 八、已知限制

- 机芯是**外观级**仿真：几何、齿数、层高、啮合关系都自洽，但没有做真实的公差、齿侧间隙与摩擦模型；
  条盒鼓的盖被单独分离以露出发条（真表盖上后看不见发条），属展示性剖切。
- 主夹板细轴（半径 0.085 mm）不参与平面碰撞校验——真表里它们穿过轮辐空隙，几何简化后无法逐点判定。
- 擒纵与摆轮的显示频率是**限频**的（避免采样混叠），真值见机芯读数表。
- 移动端竖屏下机芯特写会退后 2.2 倍以避免裁切，细节可读性弱于桌面。
- 手机触摸拖拽旋转**未启用**（`js/main.js` 对 `pointerType === 'touch'` 直接返回，画布 `touch-action: pan-y`）；
  手机端以滚动翻幕为主。

## 九、许可与发布

- 源码许可：**MIT**，见 [`LICENSE`](LICENSE)。
- 第三方：随包分发 `vendor/three/**`（three.js r0.184.0，MIT），署名义务见 [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md)。
- 部署步骤与发布前检查清单：[`docs/deploy.md`](docs/deploy.md)；打包脚本 `node scripts/package-static.mjs`（产物 `dist/`，不入库）。
- 仓库含 `.nojekyll`——GitHub Pages 默认会跑 Jekyll 并**排除 `vendor/` 目录**，加这个空文件才能让 `vendor/three/**` 正常被访问。
