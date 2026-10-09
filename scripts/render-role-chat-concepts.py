"""Generate four editable, role-specific order-chat UI concepts."""
from html import escape
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / 'docs/design'
OUT.mkdir(parents=True, exist_ok=True)

THEMES = {
    'brand': dict(accent='#2563eb', dark='#1d4ed8', soft='#eff6ff', border='#bfdbfe', label='品牌方', tint='#e5f0ff'),
    'designer': dict(accent='#e11d48', dark='#c026d3', soft='#fff1f2', border='#fecdd3', label='设计师', tint='#ffe9f0'),
}

class Art:
    def __init__(self, width, height, theme):
        self.w, self.h, self.t = width, height, theme
        self.parts = [f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-label="{theme['label']}订单聊天设计图">
<defs>
<linearGradient id="page" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fafcff"/><stop offset="1" stop-color="{theme['tint']}"/></linearGradient>
<linearGradient id="accent" x1="0" y1="0" x2="1" y2="1"><stop stop-color="{theme['accent']}"/><stop offset="1" stop-color="{theme['dark']}"/></linearGradient>
<linearGradient id="art" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#dae9db"/><stop offset="1" stop-color="#a4c1a9"/></linearGradient>
<filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#344070" flood-opacity=".14"/></filter>
<filter id="smallShadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="4" stdDeviation="7" flood-color="#344070" flood-opacity=".09"/></filter>
</defs><style>text{{font-family:'Hiragino Sans GB','PingFang SC','Microsoft YaHei',sans-serif}}</style>''']
    def add(self,s): self.parts.append(s)
    def rect(self,x,y,w,h,fill='#fff',r=0,stroke=None,sw=1,extra=''):
        edge=f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ''
        self.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}"{edge} {extra}/>')
    def txt(self,x,y,s,size=14,color='#1e293b',weight=400,anchor='start',extra=''):
        self.add(f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}" text-anchor="{anchor}" {extra}>{escape(s)}</text>')
    def line(self,x1,y1,x2,y2,color='#e4e8f1',sw=1):
        self.add(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{sw}"/>')
    def circle(self,x,y,r,fill): self.add(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}"/>')
    def pill(self,x,y,w,s,fill=None,color=None,h=28,size=12,stroke=None):
        self.rect(x,y,w,h,fill or self.t['soft'],h/2,stroke)
        self.txt(x+w/2,y+h/2+size*.34,s,size,color or self.t['accent'],650,'middle')
    def avatar(self,x,y,s,fill,size=40):
        self.circle(x+size/2,y+size/2,size/2,fill)
        self.txt(x+size/2,y+size/2+5,s,14,'#fff',750,'middle')
    def save(self,name):
        self.parts.append('</svg>')
        target=OUT/name
        target.write_text(''.join(self.parts),encoding='utf-8')
        print(target)

def product_tile(c,x,y,w,h,choice):
    c.rect(x,y,w,h,'#f5f8f2',12,'#e3e8e1')
    c.rect(x+10,y+10,w-20,h-41,'url(#art)',8)
    c.rect(x+w*.37,y+22,w*.26,h-70,'#f7f7e9',6)
    c.rect(x+w*.40,y+15,w*.20,10,'#6f9276',3)
    c.txt(x+w/2,y+h*.48,'茶',21,'#547559',750,'middle')
    c.txt(x+16,y+h-11,choice,12,'#42506a',650)

def pc(role):
    t=THEMES[role]; c=Art(1800,1180,t); accent=t['accent']
    c.rect(0,0,1800,1180,'url(#page)')
    c.circle(1700,50,205,t['tint'])
    c.pill(55,34,187,'ROLE-SPECIFIC DESIGN',t['soft'],accent,27,11)
    c.txt(55,96,f"{t['label']}端 · 订单协作工作台",37,'#111b37',800)
    c.txt(56,128,'基于聊天 Demo 的结构化卡片协作与订单时间线',16,'#64748b')
    c.pill(1515,62,225,'PC CONCEPT  ·  v1.0','#fff','#64748b',36,12,'#e4e8f1')
    c.rect(55,160,1690,909,'#fff',25,extra='filter="url(#shadow)"')
    c.rect(55,160,1690,65,'#fff',25)
    c.rect(55,201,1690,24,'#fff')
    c.line(55,225,1745,225)
    c.rect(78,179,30,30,'url(#accent)',9)
    c.txt(93,200,'创',15,'#fff',800,'middle')
    c.txt(119,200,'创赢 Design',17,'#172036',800)
    tabs=['工作台','订单管理','设计师','协作消息'] if role=='brand' else ['接单大厅','我的任务','作品中心','协作消息']
    x=333
    for tab in tabs:
        if tab=='协作消息': c.pill(x-14,177,96,tab,t['soft'],accent,32,12)
        else: c.txt(x,199,tab,13,'#8290a5',600)
        x+=112
    c.txt(1514,201,'帮助中心',12,'#94a0b1')
    c.avatar(1598,176,'品' if role=='brand' else '设',accent,37)
    c.txt(1645,200,'品牌方工作台' if role=='brand' else '设计师工作台',12,'#263149',700)

    # Left pane
    c.rect(55,225,296,844,'#fff')
    c.line(351,225,351,1069)
    c.txt(80,266,'订单会话',17,'#1f2a44',750)
    c.pill(192,244,27,'3',t['soft'],accent,24,11)
    c.rect(79,281,247,40,'#f7f8fb',10,'#edf0f5')
    c.txt(95,307,'⌕',21,'#a3adbf')
    c.txt(122,306,'搜索品牌 / 订单',11,'#a0aabc')
    for xx,label,w in [(79,'全部',58),(145,'待我处理',82),(235,'进行中',80)]:
        c.pill(xx,340,w,label,t['soft'] if label=='全部' else '#f5f6fa',accent if label=='全部' else '#7b879b',26,11)
    conversations=(
        [('茶予山野','秋季茶饮主图','待确认方案','品','#d89d70'),('朵云生活','详情页设计','已提交需求','朵','#7ba9ac'),('森屿家居','包装视觉','设计中','森','#89a379')]
        if role=='brand' else
        [('茶予山野','秋季茶饮主图','待确认需求','茶','#d89d70'),('朵云生活','详情页设计','待批注反馈','朵','#7ba9ac'),('森屿家居','包装视觉','待交付','森','#89a379')]
    )
    for i,(name,project,status,initial,color) in enumerate(conversations):
        y=386+i*115
        if i==0:
            c.rect(67,y,270,104,t['soft'],14)
            c.rect(67,y,4,104,accent,2)
        if i>0: c.line(79,y+108,326,y+108)
        c.avatar(84,y+16,initial,color,39)
        c.txt(135,y+35,name,13,'#27324a',700)
        c.txt(135,y+58,project+' · TM-081' if i==0 else project,11,'#8d99aa')
        c.txt(85,y+85,status,11,accent if i==0 else '#69768d',650 if i==0 else 500)
        if i==0: c.pill(297,y+17,24,'2',accent,'#fff',22,10)
    c.rect(79,916,247,109,'#fafbff',13,'#e8eaf1')
    c.txt(95,948,'按订单隔离对话',12,'#27324a',700)
    c.txt(95,973,'消息、卡片与确认记录同源',11,'#8b96a7')
    c.txt(95,996,'断线重连后按序号补齐',11,'#8b96a7')

    # Center header and stage
    c.rect(351,225,976,82,'#fff')
    c.line(351,307,1327,307)
    c.avatar(376,242,'茶','#d89d70',43)
    c.txt(432,264,'茶予山野 · 秋季茶饮主图设计',16,'#172036',750)
    c.txt(432,289,'订单 TM-20261002-081  ·  天猫主图  ·  截止 10 月 08 日',11,'#8b96a7')
    c.pill(1170,247,124,'方案确认中' if role=='brand' else '需求确认中',t['soft'],accent,29,11)
    c.rect(351,307,976,535,'#f9faff')
    c.rect(376,327,925,46,'#fff',11,'#e6eaf1')
    stages=['已接单','需求确认','设计 / 改稿','交付验收']
    for i,(xx,stage) in enumerate(zip([410,600,804,1035],stages)):
        active=i <= (2 if role=='brand' else 1)
        c.circle(xx,350,10,accent if active else '#e9ebf2')
        c.txt(xx,354,'✓' if i<2 and active else str(i+1),10,'#fff' if active else '#98a4b7',750,'middle')
        c.txt(xx+21,354,stage,11,accent if i==(2 if role=='brand' else 1) else '#6f7a90',700 if i==(2 if role=='brand' else 1) else 550)
    c.pill(773,391,128,'今天 · 10:24','#edf0f5','#8a96a9',25,10)

    if role=='brand':
        c.avatar(379,438,'设',accent,30)
        c.txt(420,455,'设计师 · 林知予',11,'#8b96a7',600)
        c.rect(416,466,636,53,'#fff',12,'#e6eaf1')
        c.txt(435,498,'我整理了两套主图视觉方向，请选择更接近品牌调性的方案。',12,'#34415b')
        c.rect(415,535,757,282,'#fff',16,'#d9e5fa',1,'filter="url(#smallShadow)"')
        c.rect(415,535,757,7,'url(#accent)',4)
        c.txt(438,570,'主图风格 A/B 方案决策卡',17,'#202c45',750)
        c.txt(438,592,'设计师提交 · v1 · 请选择一个方案或提出调整',11,'#8b96a7')
        c.pill(1054,548,91,'待我决策','#fff4e5','#aa681a',28,11)
        product_tile(c,438,608,340,168,'方案 A  ·  轻盈自然')
        product_tile(c,792,608,340,168,'方案 B  ·  质感聚焦')
        c.rect(438,786,341,21,t['soft'],6)
        c.txt(609,801,'查看大图与设计说明',10,accent,700,'middle')
        c.rect(792,786,340,21,t['soft'],6)
        c.txt(962,801,'选择方案并确认方向  →',10,accent,700,'middle')
    else:
        c.avatar(379,437,'茶','#d89d70',30)
        c.txt(420,454,'茶予山野 · 品牌方',11,'#8b96a7',600)
        c.rect(416,466,624,53,'#fff',12,'#e6eaf1')
        c.txt(435,497,'素材、参考图和交付尺寸已经补齐，请帮我确认范围。',12,'#34415b')
        c.rect(415,534,757,276,'#fff',16,'#f2d4df',1,'filter="url(#smallShadow)"')
        c.rect(415,534,757,7,'url(#accent)',4)
        c.txt(438,571,'电商主图设计需求卡',17,'#202c45',750)
        c.txt(438,592,'品牌方提交 · v1 · 关联当前订单',11,'#8b96a7')
        c.pill(1030,548,115,'待我确认','#fff4e5','#aa681a',28,11)
        c.line(438,608,1148,608)
        for yy,k,v in [(639,'交付范围','天猫主图 3 张 · 1:1 / 3:4'),(670,'视觉方向','自然留白 / 柔和茶绿'),(701,'素材参考','已上传 6 项素材、2 张对标图'),(732,'截止时间','10 月 08 日 18:00')]:
            c.txt(438,yy,k,11,'#8b96a7')
            c.txt(532,yy,v,12,'#34415b',650)
        c.rect(438,754,330,37,'#fff',9,'#d8dce8')
        c.txt(603,778,'提出问题 / 请求补充',11,accent,700,'middle')
        c.rect(783,754,366,37,'url(#accent)',9)
        c.txt(966,778,'确认范围并开始设计',11,'#fff',700,'middle')
        c.txt(424,830,'需求确认会形成 v1 快照；新增内容需走变更卡。',11,'#8792a6')

    # Composer
    c.rect(351,842,976,227,'#fff')
    c.line(351,842,1327,842)
    c.txt(377,874,'快捷操作',11,'#8994a7',650)
    tools=(['补充素材','填写需求','风格决策','修改反馈','验收确认'] if role=='brand' else ['业务需求卡','AI 灵感','图片批注','A/B 提案','改稿单','交付自检'])
    tx=465
    for tool in tools:
        w=max(84,len(tool)*14+24)
        c.pill(tx,852,w,tool,t['soft'] if tool==tools[1 if role=='brand' else 0] else '#f4f5f9',accent if tool==tools[1 if role=='brand' else 0] else '#65738a',32,11)
        tx+=w+8
    c.rect(376,898,925,137,'#fff',13,'#dfe4ed')
    c.txt(398,928,'输入消息，或使用上方工具继续协作…',12,'#a0aabc')
    c.txt(398,1006,'＋ 添加附件',11,'#7b879b',600)
    c.txt(526,1006,'Enter 发送 · Shift+Enter 换行',10,'#a5afc0')
    c.rect(1195,982,87,36,'url(#accent)',9)
    c.txt(1239,1005,'发送',12,'#fff',700,'middle')
    c.txt(376,1055,'消息在服务端保存后显示“已保存”；断线期间保留待发内容。',10,'#9ca6b8')

    # Right pane
    c.rect(1327,225,418,844,'#fff')
    c.line(1327,225,1327,1069)
    c.txt(1353,265,'订单决策面板' if role=='brand' else '项目执行面板',17,'#1f2a44',750)
    c.line(1353,281,1718,281)
    c.pill(1353,295,117,'当前订单',t['soft'],accent,30,11)
    c.pill(1478,295,117,'协作档案','#f4f5f9','#758197',30,11)
    c.rect(1352,346,367,119,t['soft'],15)
    c.txt(1372,375,'待我决策' if role=='brand' else '待我处理',11,'#7c86a4',650)
    c.txt(1372,406,'选择主图风格方向' if role=='brand' else '确认交付范围',18,accent,750)
    c.txt(1372,435,'1 张决策卡待处理' if role=='brand' else '品牌方需求卡 v1 待确认',12,'#687696')
    c.circle(1678,405,20,'#fff')
    c.txt(1678,412,'!' if role=='brand' else '✓',20,accent,750,'middle')
    c.txt(1353,504,'订单摘要',14,'#27334e',750)
    c.rect(1352,520,367,190,'#fff',13,'#e4e8f1')
    for yy,k,v in [(552,'交付内容','天猫主图 3 张'),(585,'截止时间','10 月 08 日 18:00'),(618,'订单预算','¥ 2,400'),(651,'当前阶段','方案确认' if role=='brand' else '需求确认')]:
        c.txt(1372,yy,k,11,'#8b96a7')
        c.txt(1698,yy,v,12,'#2d3952',650,'end')
        if yy!=651: c.line(1372,yy+10,1698,yy+10)
    c.txt(1353,749,'下一步',14,'#27334e',750)
    c.rect(1352,765,367,133,'#fff',13,'#e4e8f1')
    if role=='brand':
        c.txt(1372,795,'确认方案后锁定视觉方向',12,'#2d3952',700)
        c.txt(1372,822,'新增要求使用「修改反馈」卡',11,'#7b879b')
        c.txt(1372,847,'双方确认的版本沉淀为契约快照',11,'#7b879b')
        c.pill(1372,861,105,'已确认需求 v1','#eef9f2','#16845c',24,10)
    else:
        c.txt(1372,795,'确认需求 → 制作初稿 → 提审',12,'#2d3952',700)
        c.txt(1372,822,'素材齐全：6 / 6  ·  参考图：2 / 2',11,'#7b879b')
        c.txt(1372,847,'交付前运行源文件和尺寸自检',11,'#7b879b')
        c.pill(1372,861,114,'预计剩余 6 天',t['soft'],accent,24,10)
    c.rect(1352,920,367,86,'#f8faff',12,'#e4e8f1')
    c.txt(1373,950,'协作记录可追溯',12,'#29354f',700)
    c.txt(1373,974,'卡片状态、版本、附件与操作人关联订单',11,'#8792a6')
    c.txt(1353,1038,'右侧只汇总已提交及已确认的信息。',11,'#a1aabc')

    c.txt(55,1111,'角色重点',20,'#172036',750)
    c.txt(55,1140,'品牌方围绕素材、风格与验收做决策；设计师围绕范围确认、制作与交付执行。',13,'#64748b')
    c.save(f"{role}-order-chat-pc.svg")

def mobile(role):
    t=THEMES[role]; c=Art(1100,1250,t); accent=t['accent']
    c.rect(0,0,1100,1250,'url(#page)')
    c.circle(1040,60,190,t['tint'])
    c.pill(65,34,194,'ROLE-SPECIFIC MOBILE',t['soft'],accent,27,11)
    c.txt(65,95,f"{t['label']}端 · 移动协作",37,'#111b37',800)
    c.txt(67,124,'聊天主线与角色动作两屏并排展示，适用于移动网页与小程序设计',15,'#64748b')
    c.pill(857,60,180,'MOBILE  ·  v1.0','#fff','#64748b',35,11,'#e4e8f1')

    def phone(x,number,title):
        c.pill(x+8,150,26,str(number),accent,'#fff',26,12)
        c.txt(x+47,169,title,17,'#1f2a44',750)
        c.rect(x,190,438,897,'#17213a',39,extra='filter="url(#shadow)"')
        c.rect(x+7,197,424,883,'#f7f8fc',33)
        c.rect(x+168,201,103,22,'#17213a',12)
        c.txt(x+31,235,'9:41',13,'#273149',750)
        c.txt(x+369,235,'●  ▮▮  ▰',10,'#273149',700)
        return x+7
    def safe(x): c.rect(x+160,1061,104,5,'#26334b',3)

    # Left phone: chat
    x=65; s=phone(x,1,'订单聊天')
    c.rect(s,249,424,72,'#fff')
    c.txt(s+24,281,'‹',31,'#273149')
    c.txt(s+59,280,'茶予山野',18,'#172036',750)
    c.txt(s+59,304,'TM-081 · 秋季茶饮主图',11,'#8994a7')
    c.pill(s+331,263,70,'档案',t['soft'],accent,32,11)
    c.rect(s+19,338,386,43,t['soft'],12)
    c.txt(s+35,366,'方案确认中' if role=='brand' else '需求确认中',12,accent,700)
    c.txt(s+310,366,'第 3 / 4 阶段' if role=='brand' else '第 2 / 4 阶段',10,'#7b87a2')
    c.pill(s+145,397,130,'今天 · 10:24','#ebedf5','#8994a7',25,10)

    if role=='brand':
        c.avatar(s+19,446,'设',accent,31)
        c.rect(s+60,443,328,65,'#fff',13,'#e5e9f1')
        c.txt(s+74,467,'两套主图风格方案已准备好，',11,'#40506c')
        c.txt(s+74,489,'请选一个更接近品牌调性的方向。',11,'#40506c')
        c.rect(s+19,527,386,276,'#fff',17,t['border'],1,'filter="url(#smallShadow)"')
        c.rect(s+19,527,386,7,'url(#accent)',4)
        c.txt(s+37,560,'主图风格 A/B 决策卡',15,'#263149',750)
        c.pill(s+300,542,87,'待我选择','#fff4e5','#a96517',25,10)
        c.txt(s+37,582,'设计师提交 · v1',10,'#8b96a7')
        product_tile(c,s+37,599,164,150,'A · 自然留白')
        product_tile(c,s+214,599,173,150,'B · 质感聚焦')
        c.rect(s+37,760,350,29,t['soft'],8)
        c.txt(s+212,780,'查看方案说明并做决定  →',11,accent,700,'middle')
        c.rect(s+140,820,263,53,t['soft'],12)
        c.txt(s+156,843,'方案 A 更符合我们这次的调性。',11,'#40506c')
        c.txt(s+364,860,'已保存',10,'#9ba4b7',500,'end')
    else:
        c.avatar(s+19,446,'茶','#d89d70',31)
        c.rect(s+60,443,328,65,'#fff',13,'#e5e9f1')
        c.txt(s+74,467,'尺寸与参考图补齐了，',11,'#40506c')
        c.txt(s+74,489,'请确认后开始设计。',11,'#40506c')
        c.rect(s+19,527,386,276,'#fff',17,t['border'],1,'filter="url(#smallShadow)"')
        c.rect(s+19,527,386,7,'url(#accent)',4)
        c.txt(s+37,560,'电商主图设计需求卡',15,'#263149',750)
        c.pill(s+300,542,87,'待我确认','#fff4e5','#a96517',25,10)
        c.txt(s+37,582,'品牌方提交 · v1',10,'#8b96a7')
        c.line(s+37,598,s+387,598)
        for yy,k,v in [(628,'交付','3 张主图 · 1:1 / 3:4'),(657,'风格','自然留白 / 柔和茶绿'),(686,'素材','6 项素材 · 2 张参考'),(715,'截止','10 月 08 日 18:00')]:
            c.txt(s+37,yy,k,11,'#8994a7')
            c.txt(s+99,yy,v,11,'#34415b',650)
        c.rect(s+37,758,350,29,t['soft'],8)
        c.txt(s+212,778,'核对完整内容  →',11,accent,700,'middle')
        c.rect(s+119,821,284,52,'#fff4e8',12)
        c.txt(s+135,843,'网络不稳定，消息正在重试…',11,'#9a5d15')
        c.txt(s+135,860,'本地已保留 · 待服务器确认',10,'#b27d45')

    c.rect(s,902,424,178,'#fff')
    c.line(s,902,s+424,902)
    tools=['补充素材','填写需求','修改反馈'] if role=='brand' else ['需求卡','图片批注','A/B 提案']
    tx=s+19
    for tool in tools:
        w=105 if len(tool)>3 else 87
        c.pill(tx,917,w,tool,t['soft'] if tool==tools[1 if role=='brand' else 0] else '#f4f5f9',accent if tool==tools[1 if role=='brand' else 0] else '#69768d',31,11)
        tx+=w+8
    c.rect(s+18,964,318,70,'#f8f9fc',12,'#e3e7f0')
    c.txt(s+35,991,'输入消息…',12,'#a0aabc')
    c.txt(s+35,1018,'＋ 添加附件',10,'#8b96a7')
    c.rect(s+344,985,59,50,'url(#accent)',13)
    c.txt(s+373,1017,'↑',25,'#fff',700,'middle')
    safe(s)

    # Right phone: role decision
    x=596; s=phone(x,2,'关键操作')
    c.rect(s,249,424,67,'#fff')
    c.txt(s+24,281,'‹',31,'#273149')
    c.txt(s+61,281,'选择主图方案' if role=='brand' else '确认需求范围',18,'#172036',750)
    c.txt(s+367,280,'···',24,'#7b879b',650)
    c.rect(s+19,333,386,78,t['soft'],15)
    c.txt(s+37,359,'秋季茶饮主图 · TM-081',13,accent,750)
    c.txt(s+37,384,'确认后将形成版本记录，后续调整需留痕',10,'#7d89a3')
    if role=='brand':
        c.txt(s+22,445,'方案对比',14,'#27334d',750)
        product_tile(c,s+19,460,386,237,'A · 自然留白 / 清新呼吸感')
        c.circle(s+373,488,14,accent)
        c.txt(s+373,493,'✓',12,'#fff',750,'middle')
        c.rect(s+19,713,386,117,'#fff',14,'#e4e8f1')
        c.txt(s+37,741,'设计说明',12,'#27334d',700)
        c.txt(s+37,765,'柔和茶绿作底，突出产品包装与茶汤。',11,'#66748c')
        c.txt(s+37,788,'保留价格文案位，适合新品首发主图。',11,'#66748c')
        c.pill(s+37,801,120,'查看方案 B 对比',t['soft'],accent,24,10)
        c.txt(s+22,862,'品牌方决策备注',12,'#27334d',700)
        c.rect(s+19,875,386,52,'#fff',11,'#e4e8f1')
        c.txt(s+35,906,'方案 A 更符合本次品牌调性',11,'#516079')
        c.rect(s,950,424,130,'#fff')
        c.line(s,950,s+424,950)
        c.rect(s+19,969,177,49,'#fff',12,t['border'])
        c.txt(s+108,1000,'提出调整',12,accent,700,'middle')
        c.rect(s+205,969,200,49,'url(#accent)',12)
        c.txt(s+305,1000,'确认选择方案 A',12,'#fff',700,'middle')
        c.txt(s+22,1044,'确认结果会回填到聊天与协作档案',10,'#9aa5b7')
    else:
        c.txt(s+22,444,'交付范围',14,'#27334d',750)
        c.rect(s+19,460,386,174,'#fff',14,'#e4e8f1')
        for yy,k,v in [(491,'平台','天猫'),(525,'数量尺寸','主图 3 张 · 1:1 / 3:4'),(559,'交付文件','PSD 分层源文件'),(593,'截止时间','10 月 08 日 18:00')]:
            c.txt(s+37,yy,k,11,'#8b96a7')
            c.txt(s+129,yy,v,11,'#34415b',650)
            if yy!=593: c.line(s+37,yy+12,s+386,yy+12)
        c.txt(s+22,666,'素材与参考',14,'#27334d',750)
        for j in range(3):
            xx=s+19+j*130
            c.rect(xx,682,118,111,'url(#art)' if j<2 else t['soft'],12)
            if j<2:
                c.rect(xx+42,705,34,52,'#f7f7e9',5)
                c.rect(xx+45,698,28,9,'#75967a',2)
                c.txt(xx+59,736,'茶',12,'#557657',700,'middle')
            else: c.txt(xx+59,745,'＋4',18,accent,700,'middle')
        c.rect(s+19,813,386,105,'#fff',14,'#e4e8f1')
        c.txt(s+37,844,'确认后进入制作阶段',12,'#27334d',700)
        c.txt(s+37,869,'范围变更另起版本，原需求继续留存。',11,'#7b879b')
        c.txt(s+37,894,'问题可通过「请求补充」发回品牌方。',11,'#7b879b')
        c.rect(s,950,424,130,'#fff')
        c.line(s,950,s+424,950)
        c.rect(s+19,969,177,49,'#fff',12,t['border'])
        c.txt(s+108,1000,'请求补充',12,accent,700,'middle')
        c.rect(s+205,969,200,49,'url(#accent)',12)
        c.txt(s+305,1000,'确认并开始设计',12,'#fff',700,'middle')
        c.txt(s+22,1044,'确认结果会生成 v1 快照与任务节点',10,'#9aa5b7')
    safe(s)

    c.txt(65,1140,'移动端动作重点',20,'#172036',750)
    c.txt(65,1170,'品牌方：审阅视觉方案并做决策。设计师：核对范围后推进制作；所有确认都回到订单时间线。',13,'#64748b')
    c.save(f"{role}-order-chat-mobile.svg")

for role in ('brand','designer'):
    pc(role)
    mobile(role)
