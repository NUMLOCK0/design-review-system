"""Generate the mobile order-chat interaction board as an editable SVG."""
from html import escape
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / 'docs/design/mobile-order-chat-flow.svg'
p = []

def a(s): p.append(s)
def rect(x,y,w,h,fill='#fff',r=0,stroke=None,sw=1,extra=''):
    edge=f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ''
    a(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}"{edge} {extra}/>')
def txt(x,y,s,size=14,color='#1e293b',weight=400,anchor='start',extra=''):
    a(f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}" text-anchor="{anchor}" {extra}>{escape(s)}</text>')
def ln(x1,y1,x2,y2,color='#e4e8f1',sw=1,extra=''):
    a(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{sw}" {extra}/>')
def circ(x,y,r,fill,extra=''):
    a(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" {extra}/>')
def pill(x,y,w,s,fill='#eef2ff',color='#5146e5',h=28,size=12,stroke=None):
    rect(x,y,w,h,fill,h/2,stroke)
    txt(x+w/2,y+h/2+size*.35,s,size,color,650,'middle')
def avatar(x,y,s,fill,size=43):
    circ(x+size/2,y+size/2,size/2,fill)
    txt(x+size/2,y+size/2+5,s,14,'#fff',750,'middle')
def phone(x,label,subtitle):
    pill(x+8,139,26,label,'#5146e5','#fff',26,12)
    txt(x+45,158,subtitle,17,'#1f2a46',750)
    rect(x,181,405,914,'#17213a',38,extra='filter="url(#phoneShadow)"')
    rect(x+7,188,391,900,'#f7f8fc',32)
    rect(x+151,192,103,22,'#17213a',12)
    txt(x+30,227,'9:41',13,'#273149',750)
    txt(x+345,227,'●  ▮▮  ▰',10,'#273149',700)
    return x+7
def bottomline(x):
    rect(x+144,1071,104,5,'#26334b',3)

a('''<svg xmlns="http://www.w3.org/2000/svg" width="1880" height="1260" viewBox="0 0 1880 1260" role="img" aria-label="订单协作聊天移动端四屏交互设计图">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f9fbff"/><stop offset="1" stop-color="#edf0ff"/></linearGradient>
  <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#685af8"/><stop offset="1" stop-color="#4338ca"/></linearGradient>
  <linearGradient id="art" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e7ede1"/><stop offset="1" stop-color="#a4bba1"/></linearGradient>
  <filter id="phoneShadow" x="-30%" y="-25%" width="160%" height="160%"><feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#263063" flood-opacity=".18"/></filter>
</defs>
<style>text{font-family:'Hiragino Sans GB','PingFang SC','Microsoft YaHei',sans-serif}</style>''')
rect(0,0,1880,1260,'url(#bg)')
circ(1775,90,240,'#dfe5ff','opacity=".45"')
circ(48,1220,200,'#dce7ff','opacity=".45"')
pill(65,35,192,'MOBILE INTERACTION FLOW','#e8ebff','#5146e5',29,11)
txt(65,96,'订单协作沟通 · 移动端',38,'#111b37',800)
txt(67,126,'会话 → 需求卡 → 双方确认 → 协作档案；同一套语义适用于移动网页与微信小程序',16,'#64748b')
pill(1572,59,244,'4 SCREENS  ·  CONCEPT v1.0','#fff','#64748b',36,12,'#e4e8f1')

# Screen 1 — conversation entry
x=65; s=phone(x,'1','会话入口')
rect(s,241,391,71,'#fff')
txt(s+24,272,'协作消息',23,'#172036',800)
txt(s+24,297,'按订单查看双方沟通与待办',11,'#8b96a7')
circ(s+350,271,17,'#f2f3fa')
txt(s+350,277,'⌕',22,'#64748b',500,'middle')
rect(s+18,327,355,44,'#fff',12,'#e5e8f0')
txt(s+35,355,'⌕',19,'#9da7b9')
txt(s+61,354,'搜索品牌或订单编号',12,'#a0aabc')
pill(s+18,387,65,'全部','#ecebff','#5146e5',31,12)
pill(s+91,387,91,'待我处理','#fff','#748095',31,12)
pill(s+190,387,75,'进行中','#fff','#748095',31,12)
txt(s+20,452,'今天',11,'#909caf',650)

rect(s+17,468,357,135,'#fff',17,'#e6e9f2')
rect(s+17,468,4,135,'#584ced',2)
avatar(s+33,485,'茶','#d89c72',43)
txt(s+87,506,'茶予山野旗舰店',15,'#263149',700)
txt(s+87,527,'秋季茶饮主图设计 · TM-081',11,'#8b96a7')
pill(s+276,485,77,'待我确认','#fff3e4','#a76515',25,10)
txt(s+35,563,'需求卡已提交，等待你确认范围',12,'#516079')
txt(s+35,585,'10:24',10,'#9aa5b7')
circ(s+347,582,10,'#5146e5')
txt(s+347,586,'2',10,'#fff',700,'middle')

rect(s+17,616,357,123,'#fff',17,'#e6e9f2')
avatar(s+33,632,'朵','#76a6aa',43)
txt(s+87,654,'朵云生活',15,'#263149',700)
txt(s+87,674,'京东详情页 · JD-029',11,'#8b96a7')
pill(s+286,632,68,'设计中','#eef7f4','#278366',25,10)
txt(s+35,708,'设计稿已上传，等待批注',12,'#516079')
txt(s+35,728,'昨天',10,'#9aa5b7')

rect(s+17,752,357,114,'#fff',17,'#e6e9f2')
avatar(s+33,769,'森','#8aa379',43)
txt(s+87,789,'森屿家居',15,'#263149',700)
txt(s+87,810,'天猫店招设计 · TB-014',11,'#8b96a7')
pill(s+286,769,68,'已确认','#edf8f1','#16835c',25,10)
txt(s+35,844,'阶段需求已确认',12,'#516079')

rect(s,1000,391,87,'#fff')
ln(s,1000,s+391,1000)
for xx,label,sym,active in [(s+39,'首页','⌂',0),(s+115,'接单','▣',0),(s+195,'任务','☷',0),(s+275,'协作','▤',1),(s+352,'我的','○',0)]:
    txt(xx,1041,sym,21,'#5146e5' if active else '#a0aabc',700,'middle')
    txt(xx,1063,label,11,'#5146e5' if active else '#a0aabc',650,'middle')
bottomline(s)

# Screen 2 — order chat
x=505; s=phone(x,'2','订单聊天')
rect(s,241,391,75,'#fff')
txt(s+24,273,'‹',31,'#273149',500)
txt(s+57,270,'茶予山野',17,'#172036',750)
txt(s+57,294,'TM-081 · 秋季茶饮主图',11,'#8994a7')
rect(s+314,251,54,47,'#f0efff',13)
txt(s+341,280,'档案',12,'#5146e5',700,'middle')
rect(s+18,330,355,43,'#eeefff',12)
txt(s+35,357,'需求确认中',12,'#4f46e5',700)
txt(s+275,357,'第 2 / 4 阶段',11,'#7c85ae')
pill(s+134,389,122,'今天 · 10:24','#ebedf5','#8994a7',25,10)

avatar(s+19,439,'茶','#d89c72',31)
rect(s+58,435,286,67,'#fff',13,'#e5e9f1')
txt(s+73,460,'秋季新品想突出自然、轻盈感，',11,'#40506c')
txt(s+73,481,'素材已经放进需求卡。',11,'#40506c')
rect(s+98,521,274,52,'#eaeaff',13)
txt(s+113,549,'收到，我先核对交付范围。',11,'#3c399d')
txt(s+328,588,'已保存',10,'#9ba4b7')

rect(s+19,606,353,209,'#fff',16,'#dfe3f1',1,'filter="url(#phoneShadow)"')
rect(s+19,606,353,8,'url(#brand)',4)
txt(s+36,644,'电商主图设计需求卡',15,'#263149',750)
pill(s+268,627,87,'待我确认','#fff4e5','#a96618',27,10)
txt(s+36,671,'版本 v1  ·  品牌方已提交',11,'#8b96a7')
ln(s+36,686,s+355,686)
txt(s+36,709,'交付',11,'#8994a7')
txt(s+96,709,'3 张主图 · 1:1 / 3:4',11,'#34415b',600)
txt(s+36,735,'风格',11,'#8994a7')
txt(s+96,735,'自然留白 / 柔和茶绿',11,'#34415b',600)
txt(s+36,761,'素材',11,'#8994a7')
txt(s+96,761,'6 项素材 · 2 张参考图',11,'#34415b',600)
rect(s+36,779,319,25,'#f0efff',7)
txt(s+196,796,'查看完整内容并确认  →',11,'#5146e5',700,'middle')

rect(s+67,834,306,52,'#fff3e7',12)
txt(s+80,856,'这条新消息已保留，正在重试…',11,'#975b13')
txt(s+80,876,'本地已保留 · 待服务器确认',10,'#b98249')
rect(s,909,391,178,'#fff')
ln(s,909,s+391,909)
pill(s+18,922,79,'＋ 工具','#f1f2f8','#64748b',31,11)
pill(s+105,922,79,'业务卡片','#ecebff','#5146e5',31,11)
pill(s+192,922,75,'图片批注','#f1f2f8','#64748b',31,11)
rect(s+19,967,296,71,'#f8f9fc',12,'#e3e7f0')
txt(s+34,994,'输入消息…',12,'#a0aabc')
txt(s+34,1021,'＋  附件',11,'#8994a7')
rect(s+324,987,49,50,'url(#brand)',13)
txt(s+348,1018,'↑',25,'#fff',700,'middle')
txt(s+22,1060,'断线时保留草稿，重连后自动补齐',10,'#9aa5b7')
bottomline(s)

# Screen 3 — requirement card detail / action
x=945; s=phone(x,'3','需求卡确认')
rect(s,241,391,69,'#fff')
txt(s+24,274,'‹',31,'#273149')
txt(s+59,275,'需求卡详情',18,'#172036',750)
txt(s+326,275,'···',24,'#7b879b',650)
rect(s+18,326,355,82,'#f2f0ff',15)
txt(s+35,352,'电商主图设计需求',15,'#332e9b',750)
txt(s+35,375,'品牌方 10:24 提交 · v1',11,'#7b83ad')
pill(s+261,343,94,'待我确认','#fff','#a76515',27,10)
txt(s+22,442,'交付范围',13,'#27334d',750)
rect(s+18,456,355,147,'#fff',15,'#e7eaf1')
txt(s+34,484,'平台',11,'#8b96a7')
txt(s+100,484,'天猫',12,'#34415b',650)
ln(s+34,497,s+356,497)
txt(s+34,524,'数量尺寸',11,'#8b96a7')
txt(s+100,524,'主图 3 张 · 1:1 / 3:4',12,'#34415b',650)
ln(s+34,537,s+356,537)
txt(s+34,564,'交付文件',11,'#8b96a7')
txt(s+100,564,'PSD 分层源文件',12,'#34415b',650)
ln(s+34,577,s+356,577)
txt(s+34,592,'截止时间',11,'#8b96a7')
txt(s+100,592,'10 月 08 日 18:00',12,'#34415b',650)

txt(s+22,635,'视觉方向',13,'#27334d',750)
rect(s+18,649,355,79,'#fff',15,'#e7eaf1')
txt(s+34,677,'自然留白、柔和茶绿，突出新品包装。',11,'#40506c')
txt(s+34,702,'避免厚重深色与过多促销文案。',11,'#40506c')

txt(s+22,758,'素材与参考',13,'#27334d',750)
for j in range(3):
    xx=s+18+j*115
    rect(xx,771,105,98,'url(#art)' if j<2 else '#eaeaff',12)
    if j<2:
        rect(xx+36,791,33,47,'#f7f6e9',4)
        rect(xx+38,785,29,9,'#789477',2)
        txt(xx+52,818,'茶',12,'#5d7959',700,'middle')
    else:
        txt(xx+52,823,'＋3',17,'#5146e5',700,'middle')
    txt(xx+52,887,'素材' if j==0 else '参考' if j==1 else '更多',10,'#8b96a7',500,'middle')

rect(s,927,391,160,'#fff')
ln(s,927,s+391,927)
txt(s+20,953,'确认后会生成只读版本快照',11,'#8b96a7')
rect(s+19,971,165,51,'#fff',12,'#cdd3e3')
txt(s+101,1003,'提出修改',13,'#5146e5',700,'middle')
rect(s+193,971,180,51,'url(#brand)',12)
txt(s+283,1003,'确认需求',13,'#fff',700,'middle')
txt(s+21,1046,'提出修改需填写原因，原 v1 继续保留',10,'#9aa5b7')
bottomline(s)

# Screen 4 — archive after confirmation
x=1385; s=phone(x,'4','协作档案')
rect(s,241,391,69,'#fff')
txt(s+24,274,'‹',31,'#273149')
txt(s+59,275,'协作档案',18,'#172036',750)
pill(s+291,251,77,'订单关联','#f2f3fa','#64748b',27,10)
rect(s+18,327,355,111,'#eeefff',16)
txt(s+36,355,'当前有效版本',11,'#777ead')
txt(s+36,386,'需求已确认 · v1',21,'#332e9b',750)
txt(s+36,414,'设计师与品牌方已完成确认',11,'#737db0')
circ(s+338,382,21,'#ddd9ff')
txt(s+338,390,'✓',20,'#5146e5',750,'middle')

pill(s+18,455,109,'确认记录','#ecebff','#5146e5',30,11)
pill(s+135,455,101,'附件素材','#fff','#7b879b',30,11)
pill(s+243,455,100,'版本历史','#fff','#7b879b',30,11)
txt(s+22,521,'需求快照',14,'#263149',750)
rect(s+18,537,355,234,'#fff',16,'#e4e8f0')
rect(s+18,537,5,234,'#5146e5',2)
txt(s+36,569,'电商主图设计需求',14,'#263149',700)
pill(s+287,549,67,'已确认','#edf8f1','#16835c',25,10)
txt(s+36,599,'天猫 · 3 张主图 · 1:1 / 3:4',11,'#66748c')
txt(s+36,623,'视觉：自然留白 / 柔和茶绿',11,'#66748c')
txt(s+36,647,'素材：6 项 · 参考：2 张',11,'#66748c')
txt(s+36,671,'交付：PSD 分层源文件',11,'#66748c')
ln(s+36,691,s+354,691)
txt(s+36,718,'品牌方确认',11,'#8b96a7')
txt(s+354,718,'10:24',11,'#40506c',600,'end')
txt(s+36,744,'设计师确认',11,'#8b96a7')
txt(s+354,744,'10:31',11,'#40506c',600,'end')

rect(s+18,788,355,102,'#fff',15,'#e4e8f0')
txt(s+36,816,'版本与来源',13,'#263149',700)
txt(s+36,842,'v1  ·  来自订单消息 #24',11,'#66748c')
txt(s+36,866,'旧版本与修改意见将按时间线保留',11,'#8b96a7')
rect(s,927,391,160,'#fff')
ln(s,927,s+391,927)
rect(s+19,965,355,52,'url(#brand)',12)
txt(s+196,997,'导出协作记录',13,'#fff',700,'middle')
txt(s+22,1045,'返回原消息可查看提交当时的完整内容',10,'#9aa5b7')
bottomline(s)

# Flow annotation
txt(65,1144,'移动端交互原则',20,'#172036',750)
txt(65,1173,'重点动作固定在拇指可及的底部；详情与档案独立成页，返回时保留会话位置与未发草稿。',13,'#64748b')
for xx,label in [(65,'① 订单入口与待办'),(505,'② 消息与卡片时间线'),(945,'③ 确认或提出修改'),(1385,'④ 版本快照与回看')]:
    rect(xx,1192,405,45,'#fff',12,'#e4e8f0')
    txt(xx+202,1220,label,13,'#4f46e5',700,'middle')
a('</svg>')
OUT.parent.mkdir(parents=True,exist_ok=True)
OUT.write_text(''.join(p),encoding='utf-8')
print(OUT)
