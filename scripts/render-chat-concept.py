"""Render the order-chat interaction concept as an editable SVG."""
from html import escape
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / 'docs/design/order-chat-workbench.svg'
parts = []

def add(markup): parts.append(markup)
def rect(x, y, w, h, fill='#fff', r=0, stroke=None, sw=1, extra=''):
    edge = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ''
    add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}"{edge} {extra}/>')
def text(x, y, value, size=14, color='#1e293b', weight=400, anchor='start', extra=''):
    add(f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}" text-anchor="{anchor}" {extra}>{escape(value)}</text>')
def line(x1, y1, x2, y2, color='#e5e9f1', width=1, extra=''):
    add(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{width}" {extra}/>')
def circle(x, y, radius, fill, extra=''):
    add(f'<circle cx="{x}" cy="{y}" r="{radius}" fill="{fill}" {extra}/>')
def pill(x, y, w, label, fill='#eef2ff', color='#4f46e5', h=28, size=12, stroke=None):
    rect(x, y, w, h, fill, h/2, stroke)
    text(x+w/2, y+h/2+size*.35, label, size, color, 650, 'middle')
def avatar(x, y, initials, fill, size=38):
    circle(x+size/2, y+size/2, size/2, fill)
    text(x+size/2, y+size/2+5, initials, 14, '#fff', 700, 'middle')
def boxlabel(x, y, title, body, accent='#4f46e5'):
    rect(x, y, 361, 72, '#fff', 15, '#e5e9f1')
    circle(x+23, y+36, 12, accent)
    text(x+23, y+40, title[0], 12, '#fff', 700, 'middle')
    text(x+46, y+30, title[1:], 15, '#172036', 700)
    text(x+46, y+52, body, 12, '#64748b')

add('''<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1250" viewBox="0 0 1800 1250" role="img" aria-label="Cozi 订单协作聊天交互设计图">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f8faff"/><stop offset="1" stop-color="#eef2ff"/></linearGradient>
  <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#685af8"/><stop offset="1" stop-color="#4338ca"/></linearGradient>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="17" stdDeviation="22" flood-color="#333880" flood-opacity=".13"/></filter>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="5" stdDeviation="8" flood-color="#324064" flood-opacity=".08"/></filter>
</defs>
<style>text{font-family:'Hiragino Sans GB','PingFang SC','Microsoft YaHei',sans-serif;letter-spacing:0}</style>''')
rect(0, 0, 1800, 1250, 'url(#bg)')
circle(1700, 90, 220, '#e5e7ff', 'opacity=".35"')
circle(85, 1130, 170, '#dce7ff', 'opacity=".35"')
pill(55, 35, 178, 'INTERACTION CONCEPT', '#e6e9ff', '#5146e5', 27, 11)
text(55, 96, '订单协作沟通工作台', 37, '#111b37', 800)
text(57, 126, '把对话、结构化需求与确认记录放进同一条订单时间线', 16, '#64748b')
pill(1500, 58, 245, 'DESKTOP  ·  交互设计 v1.0', '#fff', '#64748b', 36, 12, '#e5e9f1')

# Application frame
rect(55, 160, 1690, 885, '#fff', 24, extra='filter="url(#shadow)"')
rect(55, 160, 1690, 67, '#fff', 24)
rect(55, 204, 1690, 23, '#fff')
line(55, 227, 1745, 227)
rect(78, 180, 30, 30, 'url(#brand)', 9)
text(93, 201, 'C', 18, '#fff', 800, 'middle')
text(118, 202, 'Cozi Design', 18, '#172036', 800)
line(270, 177, 270, 211)
text(293, 202, '工作台', 13, '#7b879b', 500)
text(365, 202, '订单', 13, '#7b879b', 500)
pill(422, 178, 94, '协作沟通', '#eef2ff', '#4f46e5', 32, 13)
text(1454, 202, '消息', 13, '#64748b')
circle(1513, 189, 4, '#f97373')
avatar(1560, 176, '设', '#4f46e5', 35)
text(1604, 199, '设计师工作台', 12, '#172036', 650)

# Left sessions
rect(55, 227, 305, 818, '#fff')
line(360, 227, 360, 1045)
text(81, 267, '订单会话', 17, '#172036', 750)
pill(184, 246, 30, '3', '#eef2ff', '#4f46e5', 25, 12)
rect(80, 283, 255, 41, '#f6f7fb', 10, '#ecedf3')
text(97, 309, '⌕', 22, '#9aa3b5', 400)
text(124, 309, '搜索品牌 / 订单编号', 12, '#a0aabc')
pill(80, 344, 63, '全部', '#eef2ff', '#4f46e5', 26, 11)
pill(151, 344, 69, '进行中', '#f6f7fb', '#7b879b', 26, 11)
pill(228, 344, 71, '待确认', '#f6f7fb', '#7b879b', 26, 11)

rect(69, 385, 277, 106, '#f0f1ff', 14)
rect(69, 385, 4, 106, '#564be8', 2)
avatar(85, 402, '茶', '#da9d72', 42)
text(139, 422, '茶予山野旗舰店', 14, '#172036', 700)
text(139, 445, 'TM-20261002-081', 11, '#7b879b')
text(87, 478, '已提交主图需求，待你确认', 12, '#4b5574')
pill(302, 404, 28, '2', '#5247e5', '#fff', 22, 11)

avatar(85, 517, '朵', '#77a9ab', 42)
text(139, 538, '朵云生活', 14, '#263149', 700)
text(139, 560, 'JD-20261001-029', 11, '#8b96a7')
text(87, 590, '设计稿已上传，等待批注', 12, '#798498')
pill(302, 520, 28, '1', '#efeff5', '#64748b', 22, 11)
line(80, 606, 335, 606)
avatar(85, 625, '森', '#8aa379', 42)
text(139, 646, '森屿家居', 14, '#263149', 700)
text(139, 668, 'TB-20260929-014', 11, '#8b96a7')
text(87, 698, '阶段需求已确认', 12, '#798498')
line(80, 714, 335, 714)
rect(80, 924, 255, 94, '#fafbff', 14, '#ebedf7')
text(97, 953, '会话按订单隔离', 12, '#29385a', 700)
text(97, 975, '沟通记录与需求版本可追溯', 11, '#8a96a9')
text(97, 996, '离线消息重新进入时自动补齐', 11, '#8a96a9')

# Conversation header
rect(360, 227, 967, 85, '#fff')
line(360, 312, 1327, 312)
avatar(387, 245, '茶', '#da9d72', 45)
text(446, 267, '茶予山野 · 秋季茶饮主图设计', 17, '#172036', 750)
text(447, 290, '订单 TM-20261002-081   ·   天猫主图   ·   设计师 林知予', 11, '#8b96a7')
pill(1126, 247, 75, '执行中', '#ecfdf3', '#159461', 28, 11)
pill(1209, 247, 96, '●  实时在线', '#f0fdf4', '#15803d', 28, 11)

# Stage strip
rect(386, 330, 915, 50, '#fff', 12, '#e8eaf2')
circle(410, 355, 11, '#5549e8')
text(410, 359, '✓', 12, '#fff', 700, 'middle')
text(432, 359, '接单', 12, '#4b5574', 650)
line(479, 355, 560, 355, '#d9dcf1', 2)
circle(580, 355, 11, '#5549e8')
text(580, 359, '2', 11, '#fff', 700, 'middle')
text(602, 359, '需求确认', 12, '#4f46e5', 700)
line(679, 355, 763, 355, '#d9dcf1', 2)
circle(782, 355, 11, '#e9ebf2')
text(782, 359, '3', 11, '#9aa3b5', 700, 'middle')
text(804, 359, '设计与改稿', 12, '#8b96a7', 600)
line(886, 355, 973, 355, '#d9dcf1', 2)
circle(992, 355, 11, '#e9ebf2')
text(992, 359, '4', 11, '#9aa3b5', 700, 'middle')
text(1014, 359, '交付验收', 12, '#8b96a7', 600)

# Message timeline
rect(360, 312, 967, 543, '#fafbff', extra='opacity=".55"')
rect(386, 330, 915, 50, '#fff', 12, '#e8eaf2')
for x, label, num, active in [(410,'接单','✓',1),(580,'需求确认','2',1),(782,'设计与改稿','3',0),(992,'交付验收','4',0)]:
    circle(x,355,11,'#5549e8' if active else '#e9ebf2')
    text(x,359,num,11,'#fff' if active else '#9aa3b5',700,'middle')
    text(x+22,359,label,12,'#4f46e5' if x==580 else '#4b5574' if active else '#8b96a7',700 if x==580 else 600)
line(479,355,560,355,'#d9dcf1',2)
line(679,355,763,355,'#d9dcf1',2)
line(886,355,973,355,'#d9dcf1',2)
pill(778, 398, 128, '今天 · 10:24', '#eff1f7', '#8190a8', 25, 11)

avatar(387, 441, '茶', '#da9d72', 30)
text(428, 455, '茶予山野', 11, '#8b96a7', 600)
rect(425, 467, 524, 65, '#fff', 13, '#e5e9f1')
text(444, 492, '这次秋季新品想突出“轻盈、自然、有呼吸感”，', 12, '#34415b')
text(444, 514, '主图先做 3 张，参考图和素材我放进需求卡。', 12, '#34415b')

avatar(1258, 552, '设', '#4f46e5', 30)
text(1245, 567, '设计师 · 林知予', 11, '#8b96a7', 600, 'end')
rect(873, 579, 382, 48, '#eef0ff', 13)
text(894, 608, '收到，我会按需求卡确认范围后开始设计。', 12, '#37358e')

# Main business card
rect(425, 646, 772, 185, '#fff', 16, '#dce1f4', 1, 'filter="url(#soft)"')
rect(425, 646, 772, 9, 'url(#brand)', 4)
rect(445, 671, 34, 34, '#eef0ff', 9)
text(462, 694, '▣', 18, '#5146e5', 700, 'middle')
text(492, 687, '电商主图设计需求卡', 16, '#172036', 750)
text(492, 708, '品牌方提交 · 版本 v1 · 关联当前订单', 11, '#8994a8')
pill(1048, 673, 125, '待设计师确认', '#fff5e7', '#b66b14', 27, 11)
line(446, 722, 1176, 722)
text(446, 748, '交付范围', 11, '#8b96a7')
text(528, 748, '天猫主图 3 张  ·  1:1 / 3:4  ·  含 PSD 源文件', 12, '#29354f', 650)
text(446, 774, '视觉方向', 11, '#8b96a7')
text(528, 774, '自然留白 / 柔和茶绿 / 突出新品包装', 12, '#29354f', 650)
text(446, 800, '素材与参考', 11, '#8b96a7')
text(528, 800, '已上传 6 项素材，2 张对标参考图', 12, '#29354f', 650)
rect(1018, 785, 151, 31, '#5146e5', 9)
text(1093, 805, '查看并确认需求  →', 11, '#fff', 700, 'middle')

# Bottom composer
rect(360, 855, 967, 190, '#fff')
line(360, 855, 1327, 855)
text(389, 888, '快捷工具', 12, '#8b96a7', 650)
pill(466, 868, 98, '标准发单', '#f4f5fa', '#53617b', 34, 12)
pill(574, 868, 105, '业务卡片', '#e9eaff', '#5146e5', 34, 12)
pill(689, 868, 105, '沟通卡箱', '#f4f5fa', '#53617b', 34, 12)
pill(804, 868, 98, '图片批注', '#f4f5fa', '#53617b', 34, 12)
pill(912, 868, 92, 'AI 风格', '#f4f5fa', '#53617b', 34, 12)
rect(386, 913, 915, 108, '#fff', 13, '#dfe3ee')
text(406, 942, '输入消息，或选择业务卡片开始结构化协作…', 13, '#a1aabd')
text(405, 998, '＋  添加附件', 11, '#64748b', 600)
text(515, 998, 'Enter 发送 · Shift+Enter 换行', 10, '#a0aabc')
rect(1183, 971, 99, 35, 'url(#brand)', 9)
text(1232, 994, '发送消息', 12, '#fff', 700, 'middle')

# Right contract board
rect(1327, 227, 418, 818, '#fff')
line(1327, 227, 1327, 1045)
text(1355, 266, '协作档案', 17, '#172036', 750)
line(1353, 280, 1719, 280)
pill(1353, 294, 143, '视觉契约', '#eef2ff', '#5146e5', 32, 12)
pill(1504, 294, 137, '案例与参考', '#f6f7fb', '#7b879b', 32, 12)

rect(1352, 346, 367, 111, '#f4f3ff', 15)
text(1372, 375, '当前协作阶段', 11, '#7c86a4')
text(1372, 405, '需求确认中', 19, '#332ca1', 750)
text(1372, 432, '已收集 1 项 · 待确认 1 项', 12, '#677399')
circle(1679, 392, 21, '#e3e1ff')
text(1679, 399, '◷', 20, '#5146e5', 600, 'middle')

text(1353, 495, '需求与决策记录', 14, '#27334e', 750)
pill(1623, 475, 96, '版本 v1', '#f3f5f9', '#64748b', 26, 11)
rect(1352, 511, 367, 170, '#fff', 13, '#e3e7f0')
rect(1352, 511, 5, 170, '#f2a544', 2)
text(1372, 538, '电商主图设计需求', 13, '#26324b', 700)
pill(1608, 522, 89, '待确认', '#fff5e7', '#b66b14', 26, 11)
text(1372, 566, '3 张主图 · 1:1 / 3:4 · PSD', 12, '#64748b')
text(1372, 590, '风格：自然留白、柔和茶绿', 12, '#64748b')
text(1372, 614, '截止：10 月 08 日 18:00', 12, '#64748b')
line(1372, 634, 1698, 634)
text(1372, 658, '来自消息 #24  ·  查看原始卡片 →', 11, '#5146e5', 650)

rect(1352, 698, 367, 132, '#fff', 13, '#e3e7f0')
text(1372, 728, '确认后自动生成版本快照', 13, '#27334e', 700)
text(1372, 752, '重要范围、附件、批注与操作人', 11, '#7c879b')
text(1372, 773, '都会保留在订单记录中。', 11, '#7c879b')
pill(1372, 790, 115, 'v1 当前版本', '#ecfdf3', '#17865b', 25, 10)
pill(1494, 790, 104, '查看修订记录', '#f5f6fa', '#58657b', 25, 10)

rect(1352, 849, 367, 58, '#f8faff', 12, '#e3e7f0')
text(1373, 875, '交付与结算', 12, '#27334e', 700)
text(1373, 895, '等待需求确认后进入设计阶段', 11, '#8b96a7')
rect(1352, 928, 367, 41, '#fff', 10, '#cbd2e5')
text(1536, 954, '导出协作记录', 12, '#5c6880', 650, 'middle')
text(1352, 1003, '所有操作均关联订单，版本不会被静默覆盖。', 11, '#98a2b5')

# Legend / interaction strip
text(55, 1101, '关键交互路径', 21, '#172036', 750)
text(55, 1127, '从发起结构化需求到形成可追溯的确认记录', 13, '#64748b')
boxlabel(55, 1150, '1 选卡片', '按业务模板创建，先预览再发送')
text(432, 1195, '→', 25, '#9da5db', 700, 'middle')
boxlabel(449, 1150, '2 填需求', '品牌方提交字段、素材与参考')
text(826, 1195, '→', 25, '#9da5db', 700, 'middle')
boxlabel(843, 1150, '3 双方确认', '设计师确认范围，变更另起版本')
text(1220, 1195, '→', 25, '#9da5db', 700, 'middle')
boxlabel(1237, 1150, '4 沉淀契约', '右侧生成快照，支持回看与导出')
add('</svg>')
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(''.join(parts), encoding='utf-8')
print(OUT)
