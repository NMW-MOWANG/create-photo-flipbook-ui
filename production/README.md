# 制作目录

按 create-photo-flipbook-ui skill 的流程制作三本书。这里放设计文档和提示词，网站本身不读取这个目录。

| 书 | id | 照片 | 跨页 |
| --- | --- | --- | --- |
| 绿荫 | lvyin | photo1, 6, 7, 8, 12 | 封面 + 4 |
| 咖啡馆 | kafeiguan | photo3, 4, 5, 11, 14, 16 | 封面 + 4 |
| 街角 | jiejiao | photo2, 9, 10, 13, 15, 17, 18 | 封面 + 4 |

每本书一个子目录：

- `creative-direction.md`：观察、备选方向、选定方向、字体和文字规则。
- `sequence-plan.md`：逐跨页的结构、介入程度、文字、节奏。
- `spreads.json`：每次生图调用的参考照片和完整提示词。

源照片：`../../christmas-tree-main/public/default-photos/`（只读，不修改）。

页面尺寸：单页 768×1024，跨页母版 1536×1024（3:2）。母版存 `books/<id>/assets/spreads/`，
从正中切成左右两页存 `books/<id>/assets/pages/`。

## 生成

接口信息放在项目外的 `~/.config/my-photo-album/image.env`（建议 `chmod 600`），脚本会自动读取：

```bash
IMAGE_API_BASE=https://api.openai.com/v1   # 任何兼容 /images/edits 的网关
IMAGE_API_KEY=...
IMAGE_MODEL=gpt-image-1
```

也可以直接用同名环境变量。

改用火山引擎即梦（Seedream 4.6）时，在同一个文件里加：

```bash
IMAGE_PROVIDER=volc
VOLC_AK=...
VOLC_SK=...
# VOLC_REQ_KEY=jimeng_seedream46_cvtob   默认值
# VOLC_SIZE=2304x1536                    默认值，生成后缩到 1536x1024
```

然后：

```bash
python3 production/generate.py lvyin --only cover s02 s03   # 先做试样
python3 production/generate.py lvyin                          # 补齐整本
python3 production/generate.py lvyin --assemble-only          # 只重新切页、写 book-data.js
```

`--dry-run` 只打印将要发送的请求，不调用接口。
