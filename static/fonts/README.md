# 自托管字体资产

本目录只存放智能排班前端实际使用的 regular WOFF2。页面运行时不访问字体 CDN；版本目录同时作为长期缓存指纹。

## 资产清单

| 字体 | 固定版本 | 使用范围 | 本地内容 |
| --- | --- | --- | --- |
| Kalam | `@fontsource/kalam@5.3.0` | 英文标题与数字标题 | Latin regular 400，1 个 WOFF2 |
| Patrick Hand | `@fontsource/patrick-hand@5.3.0` | 英文短说明与便签 | Latin regular 400，1 个 WOFF2 |
| LXGW WenKai Screen | `lxgw-wenkai-screen-web@1.522.0` | 中文标题与短说明回退 | regular 400，244 个 `unicode-range` WOFF2 分块 |

共 246 个 WOFF2，13,187,460 bytes。Kalam 和 Patrick Hand 不含中文字符，中文由 `LXGW WenKai Screen` 承接；姓名、日期、数字、表格、表单和按钮仍使用系统 UI 字体。

## 来源与完整性

- Kalam：`https://registry.npmjs.org/@fontsource/kalam/-/kalam-5.3.0.tgz`
  - npm integrity：`sha512-FDkVoDfPDCSN/eO81FOYtUI67eMgpVBJmjBtAqSL0PmEhJyeFY2biC+CR+yEttksgXR9+swpFdYmQTyjwBq80Q==`
  - tarball SHA-256：`0aaf22523f3c57ae19f32c4f4df0d43d6efd01b7563a19cf4ed818cd5601426d`
- Patrick Hand：`https://registry.npmjs.org/@fontsource/patrick-hand/-/patrick-hand-5.3.0.tgz`
  - npm integrity：`sha512-V8C38IlIFfdWg0Xtri3F7sLCVpm069rUwn6w4n+oyn38gt7H4arOJmuReg3tAw1Q6jHqZp89wTnAAJagq4Atxw==`
  - tarball SHA-256：`c3428d02610c7b8fa92b044cf766f8c30b88bb32a47460b4ac42fa14e0bcdcc0`
- LXGW WenKai Screen：`https://registry.npmjs.org/lxgw-wenkai-screen-web/-/lxgw-wenkai-screen-web-1.522.0.tgz`
  - 上游项目：`https://github.com/lxgw/LxgwWenKai-Screen/tree/v1.522`
  - npm integrity：`sha512-LH1nDJz9prHgMYNKErg8XpDEIhs9+1bf6hPVKviy29be1r6Z4AXXbo9uuwmOH2hAzKMbe3kZ5+rzJ9zb/58+jw==`
  - tarball SHA-256：`09af8afe715cf1e6a2c7ce5ec322303ceb5e03c73ed27758edfd8e315e57d801`

每个落库文件的 SHA-256 见 [`SHA256SUMS.txt`](SHA256SUMS.txt)。各字体版本目录内保留对应 `OFL-1.1.txt`。

## 本地处理

LXGW 的 `result.min.css` 复制为 `lxgw-wenkai-screen.css`，保留原始 `unicode-range`、`font-weight: 400` 和 `font-display: swap`；仅移除了 `local("LXGW WenKai Screen")`，保证所有设备都读取仓库固定的 WOFF2，而不会意外使用系统中其他版本。
