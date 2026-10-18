"""截图与验收脚本：用系统 Python + Playwright 驱动本机 Chrome。

用法：
  python -B -X utf8 scripts/capture.py                 # 1440x900 全幕截图
  python -B -X utf8 scripts/capture.py --mobile        # 追加 390x844
  python -B -X utf8 scripts/capture.py --shots 0,3,6   # 只截指定幕
  python -B -X utf8 scripts/capture.py --probe         # 追加交互与性能探测

脚本会启动本地服务器（scripts/serve.cjs）、等待 window.__watch.ready，
再逐幕调用 __watch.setProgress(A) + 固定动画时间后截图，输出到 shots/。
报告（含控制台错误、帧率、draw call、三角面）写入 shots/report.json 与 shots/report.txt。
"""

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "shots"
PORT = int(os.environ.get("WATCH_PORT", "8788"))
URL = f"http://127.0.0.1:{PORT}/"

ACTS = [
    (0.02, "act0-opening"),
    (0.85, "act1-emergence"),
    (1.55, "act2-orbit"),
    (2.75, "act3-explosion"),
    (3.72, "act4-calibre"),
    (4.60, "act5-reassembly"),
    (5.80, "act6-signature"),
]


def start_server():
    proc = subprocess.Popen(
        ["node", str(ROOT / "scripts" / "serve.cjs"), str(PORT)],
        cwd=str(ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    time.sleep(1.2)
    return proc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mobile", action="store_true", help="追加 390x844 视口")
    ap.add_argument("--shots", default="", help="逗号分隔的幕序号（1-6）")
    ap.add_argument("--probe", action="store_true", help="追加交互/性能探测")
    ap.add_argument("--quality", default="", help="强制质量档 high/medium/low")
    ap.add_argument("--prefix", default="", help="文件名前缀")
    args = ap.parse_args()

    from playwright.sync_api import sync_playwright

    SHOTS.mkdir(exist_ok=True)
    server = start_server()
    report = {"url": URL, "viewport": [], "errors": [], "console": [], "stats": {}, "shots": []}
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                channel="chrome",
                headless=True,
                args=[
                    "--enable-unsafe-swiftshader",
                    "--use-gl=angle",
                    "--ignore-gpu-blocklist",
                    "--enable-webgl",
                    "--hide-scrollbars",
                    "--disable-lcd-text",
                ],
            )
            viewports = [(1440, 900, "desktop")]
            if args.mobile:
                viewports.append((390, 844, "mobile"))
            selected = None
            if args.shots:
                selected = {int(x) for x in args.shots.split(",") if x.strip()}

            for w, h, tag in viewports:
                ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=1)
                page = ctx.new_page()
                page.on("pageerror", lambda e: report["errors"].append(str(e)))
                page.on(
                    "console",
                    lambda m: report["console"].append({"type": m.type, "text": m.text})
                    if m.type in ("error", "warning")
                    else None,
                )
                q = f"?quality={args.quality}" if args.quality else ""
                page.goto(URL + q, wait_until="load", timeout=60000)
                page.wait_for_function("window.__watch && window.__watch.ready === true", timeout=90000)
                page.wait_for_timeout(900)
                report["viewport"].append({"tag": tag, "width": w, "height": h})

                for i, (a, name) in enumerate(ACTS):
                    if selected and (i + 1) not in selected:
                        continue
                    page.evaluate("(a) => window.__watch.setProgress(a)", a)
                    page.evaluate("(t) => window.__watch.setTime(t)", 12.5)
                    page.wait_for_timeout(650)
                    out = SHOTS / f"{args.prefix}{name}__{tag}.png"
                    page.screenshot(path=str(out))
                    report["shots"].append(str(out.relative_to(ROOT)).replace("\\", "/"))
                    print(f"[shot] {out.name}")

                report["stats"][tag] = page.evaluate("window.__watch.stats()")

                if args.probe:
                    # 交互探测：切真实节拍、点“探索机芯”、拖拽旋转
                    page.evaluate("window.__watch.setTempo('real')")
                    page.evaluate("window.__watch.setProgress(3.75)")
                    page.wait_for_timeout(600)
                    out = SHOTS / f"{args.prefix}probe-real-tempo__{tag}.png"
                    page.screenshot(path=str(out))
                    report["shots"].append(str(out.relative_to(ROOT)).replace("\\", "/"))
                    probe = page.evaluate(
                        """() => {
                          const before = window.__watch.stats().A;
                          document.querySelector('[data-action="movement"]').click();
                          return { before, label: document.getElementById('tempo-btn').textContent };
                        }"""
                    )
                    report["probe"] = probe
                    page.wait_for_timeout(1400)
                    report["probe"]["afterClickA"] = page.evaluate("window.__watch.stats().A")
                    page.evaluate("window.__watch.setTempo('showcase')")

                    # 传动功能性验证：两个时刻的角度差 → 转速比与旋向
                    if tag == "desktop":
                        page.evaluate("window.__watch.setProgress(3.72)")
                        page.evaluate("window.__watch.setTime(12.5)")
                        page.wait_for_timeout(500)
                        a1 = page.evaluate("window.__watch.wheelAngles()")
                        page.evaluate("window.__watch.setTime(13.0)")
                        page.wait_for_timeout(500)
                        a2 = page.evaluate("window.__watch.wheelAngles()")
                        diff = {}
                        for k in a1:
                            if isinstance(a1[k], dict):
                                diff[k] = {kk: round(a2[k][kk] - a1[k][kk], 6) for kk in a1[k] if a1[k][kk] is not None}
                            else:
                                diff[k] = round(a2[k] - a1[k], 6)
                        report["trainMotion"] = {"t1": 12.5, "t2": 13.0, "delta": diff}
                        print("[train] delta", json.dumps(diff, ensure_ascii=False))

                ctx.close()
            browser.close()
    finally:
        server.terminate()

    (SHOTS / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = [f"url {report['url']}", f"shots {len(report['shots'])}", f"pageerrors {len(report['errors'])}"]
    for e in report["errors"]:
        lines.append(f"  ERROR {e}")
    for c in report["console"][:20]:
        lines.append(f"  {c['type'].upper()} {c['text'][:220]}")
    for tag, st in report["stats"].items():
        lines.append(
            f"stats[{tag}] fps={st.get('fps'):.1f} dpr={st.get('dpr')} q={st.get('quality')} "
            f"calls={st.get('calls')} tris={st.get('triangles')} parts={st.get('parts')} "
            f"tex={st.get('textures')} geo={st.get('geometries')}"
        )
    if "probe" in report:
        lines.append(f"probe {report['probe']}")
    if "trainMotion" in report:
        tm = report["trainMotion"]
        d = tm["delta"]
        # 校验：旋向必须逐级交替（符号），且相邻两级角速度比 = 齿数比
        keys = ["barrel", "center", "third", "fourth", "escape"]
        signs = [1 if d[k]["wheel"] > 0 else -1 for k in keys]
        alternating = all(signs[i] != signs[i - 1] for i in range(1, len(signs)))
        ratios = []
        for i in range(1, 4):
            if abs(d[keys[i]]["wheel"]) > 1e-9:
                ratios.append(abs(d[keys[i - 1]]["wheel"] / d[keys[i]]["wheel"]))
        report["trainMotion"]["alternating"] = alternating
        report["trainMotion"]["ratios"] = [round(r, 4) for r in ratios]
        lines.append(f"trainMotion t={tm['t1']}→{tm['t2']} 旋向交替={alternating} 相邻角速度比={[round(r, 3) for r in ratios]}")
        lines.append(
            "  Δ角: "
            + " ".join(f"{k}={d[k]['wheel']:+.4f}" for k in keys)
            + f" 摆轮={d['balance']:+.4f}（擒纵为限频显示，非 ×60 关系）"
        )
    (SHOTS / "report.txt").write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines))
    return 1 if report["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
