# 发布说明（deploy）

> 本文件是**发布准备**产物，不代表已经公开发布。任何真正对外发布都需要作者本人操作并授权。

## 一、结论：这是纯静态站点，零构建、零配置文件

- 页面只有 `index.html` + `css/` + `js/` + `vendor/three/`，全部用**相对路径**引用
  （`./css/style.css`、`importmap` 里的 `./vendor/three/...`），因此放在**任意子路径**下都能工作
  （例如 GitHub Pages 的项目站 `https://<user>.github.io/<repo>/`）。
- 运行期**不请求任何外部资源**：已用浏览器网络面板实测，全部 29 个请求都指向本地，外部请求为 0。
  因此不需要 CDN、不需要跨域头、不需要后端。
- `package.json` 里只有 `serve` 与 `check:train` 两个脚本，**没有 build 步骤**。
  托管方不需要 Node 运行时，也不需要构建命令（build command 留空 / 输出目录 = 站点根）。

## 二、生成部署产物

```powershell
cd E:\codexxx\mechanical-watch
node scripts/package-static.mjs          # 输出到 dist/
node scripts/package-static.mjs <目录>   # 或指定输出目录
```

最近一次实测输出：

```
out=E:\codexxx\mechanical-watch\dist
files=30 bytes=2310628 (2.20 MB)
relative refs checked=36 missing=0
```

`dist/` 只含页面运行期真正请求的 4 个条目（`index.html` / `css` / `js` / `vendor`）。
`shots/`（约 10MB 证据截图）、`docs/`、`scripts/` 不进产物——它们是仓库证据，不是页面资源。
`dist/` 已在 `.gitignore` 中。

## 三、三条可选发布路径

### A. GitHub Pages（需要你自己的 GitHub 账号）

```powershell
# 前提：已在 GitHub 建好一个空仓库，并已授权推送（本步骤需要你本人操作）
cd E:\codexxx\mechanical-watch
git remote add origin https://github.com/<你的账号>/<仓库名>.git
git push -u origin main
```

然后在仓库 **Settings → Pages**：Source 选 `Deploy from a branch`，Branch 选 `main` + `/ (root)`，
保存后访问 `https://<你的账号>.github.io/<仓库名>/`。

- 因为引用都是相对路径，项目站子路径下可直接工作（本地已按 `/dist/` 子路径实测通过）。
- 注意：推到 GitHub 会把 `shots/`（10MB 截图）一起公开。若不希望，先在 `.gitignore` 里加 `shots/`
  再提交，或改用下面的「只上传 dist」路径。

### B. Cloudflare Pages / Netlify（Direct Upload，不需要仓库）

1. 先跑 `node scripts/package-static.mjs`。
2. 打开托管方控制台的 Direct Upload / Drop 界面，把 **`dist/` 文件夹**整体拖进去。
3. 构建命令留空；输出目录填 `dist`（若拖的是 dist 内容则填 `/`）。

### C. 任意静态服务器 / 对象存储

把 `dist/` 的内容原样上传到站点根，确保 `index.html` 位于根（或在子目录下，相对路径同样成立）。
不需要任何重写规则或 MIME 配置（`.js` 必须是 `text/javascript`，主流托管默认正确）。

## 四、发布前检查清单（本地实测已通过项）

| 检查 | 命令 / 方法 | 最近实测结果 |
| --- | --- | --- |
| 传动自检 8 项 | `node scripts/check-train.mjs` | `checks=8 pass=8 fail=0` |
| 本地预览 | `node scripts/serve.cjs 8786` → `http://127.0.0.1:8786/` | 正常 |
| 通用静态服务器 + 子路径 | `python -m http.server 8899 --directory <项目父目录>` → `/dist/` | `ready=true`，253 draw call / 210,271 三角面 / 43 零件 |
| 控制台错误 | 浏览器控制台 | **0 error** |
| 外部请求 | 浏览器网络面板 | **0 个外部请求**（29/29 均本地） |
| 手机竖屏布局 | 390×844 视口 | 无横向溢出；canvas 满视口；CTA 按钮 300×47 px |
| 触摸手势 | `css/style.css` 的 `touch-action: pan-y` | 竖屏可正常滚动翻幕 |
| 可直接打开部署产物 | `file://` 打开 `index.html` | **不可**——ES module + importmap 需要 http，必须用静态服务器或托管方 |

## 五、已知行为与限制（发布时读者会遇到的）

1. **手机触摸拖拽不生效（有意为之）**：`js/main.js:179` 对 `pointerType === 'touch'` 直接 return，
   画布的 `touch-action` 为 `pan-y`。手机上只能靠**滚动**翻幕，拖拽旋转是桌面鼠标专属。
   如果希望手机也能拖拽旋转，需要改交互逻辑并重新在真机上实测，属独立改动。
2. **没有硬件加速时会自动降级**：帧率低于 42 fps 会降档一次（像素比 → 去泛光 → 尘埃减半 → 阴影减半）。
   在 Playwright 的软件渲染环境实测约 20 fps，画质自动落到 `low`；这是设计内的兜底，不是错误。
   硬件加速的 Chrome 上作者记录为 165 fps。
3. **缓存**：产物文件名**没有内容哈希**。若托管方对静态资源长期缓存，重新部署后读者可能仍打开旧文件。
   建议对该站的 HTML 设 `Cache-Control: no-cache`（或部署后换一次目录名）。
4. **不要用 `file://` 直接打开**：必须经 http（本地 `serve.cjs` 或任意静态托管）。
5. 需要 WebGL2；不支持时页面会显示降级提示块（`#fallback`）。

## 六、回滚

产物是纯静态文件，回滚 = 重新上传上一版本，或（GitHub Pages）`git revert` 后重新推送。
本地可用 `git log` / `git checkout <commit> -- .` 取回任一历史版本（首次提交为 `bffce0e`）。
