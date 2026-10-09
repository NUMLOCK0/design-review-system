"""Render editable uni-app mobile UI concept screens to SVG."""
from html import escape
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / 'docs/design/uniapp-redesign-v1.svg'
parts = []
def add(s): parts.append(s)
def rect(x,y,w,h,fill='#fff',r=0,stroke=None,sw=1,extra=''):
    edge=f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ''
    add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}"{edge} {extra}/>')
def txt(x,y,s,size=14,color='#1e293b',weight=400,anchor='start',extra=''):
    add(f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" font-weight="{weight}" text-anchor="{anchor}" {extra}>{escape(str(s))}</text>')
def line(x1,y1,x2,y2,color='#e8eff8',sw=1): add(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{sw}"/>')
def circle(x,y,r,fill,stroke=None,sw=1):
    edge=f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ''
    add(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}"{edge}/>')
def pill(x,y,w,label,fill='#eff6ff',color='#2563eb',h=25,size=10,stroke=None):
    rect(x,y,w,h,fill,h/2,stroke)
    txt(x+w/2,y+h/2+size*.36,label,size,color,650,'middle')
def phone(x,n,title,tab=None):
    y=225; w=365; h=875; sx=x+7; sy=y+7
    pill(x+4,150,32,str(n),'#2563eb','#fff',28,12)
    txt(x+48,170,title,18,'#1e293b',750)
    rect(x,y,w,h,'#24332c',38,extra='filter="url(#shadow)"')
    rect(sx,sy,w-14,h-14,'#f8fafc',31)
    rect(x+129,y+10,107,20,'#24332c',11)
    txt(sx+22,sy+29,'9:41',11,'#1e293b',700)
    txt(sx+325,sy+29,'●  ▮▮  ▰',9,'#1e293b',700,'end')
    return sx,sy,w-14,h-14

def nav(sx,sy,active):
    y=sy+804; rect(sx,y,351,51,'#fff'); line(sx,y,sx+351,y)
    items=[('⌂','工作台'),('▤','会话'),('◫','设计稿'),('○','我的')]
    for i,(icon,label) in enumerate(items):
        cx=sx+44+i*88; color='#2563eb' if label==active else '#9ba79f'
        txt(cx,y+20,icon,18,color,700,'middle'); txt(cx,y+39,label,9,color,650,'middle')
    rect(sx+129,sy+857,93,4,'#334155',2)

add('''<svg xmlns="http://www.w3.org/2000/svg" width="2250" height="1300" viewBox="0 0 2250 1300" role="img" aria-label="COZI品牌协作微信小程序五屏UI与交互提案">
<defs>
 <linearGradient id="canvas" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f8fafc"/><stop offset="1" stop-color="#e8eff8"/></linearGradient>
 <linearGradient id="hero" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#4338ca"/><stop offset=".55" stop-color="#7c3aed"/><stop offset="1" stop-color="#0ea5e9"/></linearGradient>
 <linearGradient id="brand" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#2563eb"/><stop offset="1" stop-color="#4f46e5"/></linearGradient>
 <filter id="shadow" x="-25%" y="-20%" width="150%" height="150%"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#19382a" flood-opacity=".16"/></filter>
</defs><style>text{font-family:'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif}</style>''')
rect(0,0,2250,1300,'url(#canvas)')
circle(2175,40,260,'#dbeafe'); circle(35,1240,215,'#e8eff8')
pill(65,40,205,'COZI · MINI PROGRAM UI','#eff6ff','#2563eb',30,11)
txt(65,105,'品牌协作小程序 · PC 蓝紫配色适配',37,'#111827',800)
txt(67,139,'从分享入会、即时沟通，到需求确认和设计审核；延续 PC 端蓝紫品牌色，让品牌方每一步都清楚下一步要做什么。',16,'#718076')
pill(1920,53,260,'5 KEY SCREENS · V1.0','#fff','#728177',35,11,'#e2e8f0')

# 1 Workbench
sx,sy,_,_=phone(55,1,'工作台 · 待办优先','工作台')
txt(sx+22,sy+67,'早上好，林小姐',12,'#738176',550)
txt(sx+22,sy+94,'把想法，变成好设计',22,'#1e293b',800)
rect(sx+16,sy+116,319,131,'url(#hero)',19)
pill(sx+30,sy+130,87,'今日协作','#fff','#38795f',22,9)
txt(sx+31,sy+184,'2',39,'#fff',800); txt(sx+64,sy+179,'项待你处理',13,'#fff',650)
txt(sx+31,sy+218,'需求确认 1 · 设计审核 1',10,'#e0e7ff')
circle(sx+280,sy+183,35,'#ffffff',None,1); parts[-1]=parts[-1].replace('fill="#ffffff"','fill="#ffffff" fill-opacity=".18"')
circle(sx+280,sy+183,24,'#ffffff',None,1); parts[-1]=parts[-1].replace('fill="#ffffff"','fill="#ffffff" fill-opacity=".28"')
txt(sx+280,sy+189,'✓',20,'#fff',700,'middle')
txt(sx+20,sy+281,'快捷入口',15,'#1e293b',750)
rect(sx+17,sy+294,151,75,'#fff',14,'#e2e8f0'); circle(sx+42,sy+321,14,'#eff6ff'); txt(sx+42,sy+326,'聊',12,'#2563eb',700,'middle'); txt(sx+64,sy+319,'新建会话',12,'#1e293b',700); txt(sx+29,sy+350,'分享给对方，马上开聊',9,'#89968d')
rect(sx+183,sy+294,151,75,'#fff',14,'#e2e8f0'); circle(sx+208,sy+321,14,'#f7eddc'); txt(sx+208,sy+326,'单',12,'#a87931',700,'middle'); txt(sx+230,sy+319,'填写需求单',12,'#1e293b',700); txt(sx+195,sy+350,'把沟通整理为可确认需求',9,'#89968d')
txt(sx+20,sy+404,'最近项目',15,'#1e293b',750); txt(sx+326,sy+404,'全部 →',10,'#2563eb',650,'end')
for y,initial,fill,name,title,status,statfill,statcolor,sub in [
 (sy+420,'茶','#c88c66','茶予山野','秋季新品主图','待确认','#fff1d8','#a66d26','需求单 v2 等待你的确认'),
 (sy+520,'朵','#7da7a1','朵云生活','春季详情页','设计中','#e8f3eb','#3b805f','设计师已更新 2 张设计稿')]:
    rect(sx+17,y,319,88,'#fff',14,'#e2e8f0'); circle(sx+40,y+28,16,fill); txt(sx+40,y+33,initial,12,'#fff',700,'middle'); txt(sx+66,y+27,name,12,'#1e293b',700); pill(sx+265,y+11,59,status,statfill,statcolor,21,9); txt(sx+66,y+49,title,10,'#6f7d73'); txt(sx+30,y+74,sub,9,'#86938a')
nav(sx,sy,'工作台')

# 2 Conversation list
sx,sy,_,_=phone(495,2,'会话 · 统一列表','会话')
txt(sx+22,sy+78,'会话',23,'#1e293b',800); txt(sx+325,sy+77,'＋',25,'#2563eb',500,'middle')
rect(sx+17,sy+94,319,37,'#fff',11,'#e2e8f0'); txt(sx+33,sy+118,'⌕',18,'#96a299'); txt(sx+59,sy+118,'搜索项目或对话成员',10,'#a0aaa2')
pill(sx+18,sy+146,56,'全部','#2563eb','#fff',25,10); pill(sx+82,sy+146,70,'未读','#fff','#758278',25,10,'#e2e8f0'); pill(sx+158,sy+146,76,'待确认','#fff','#758278',25,10,'#e2e8f0')
# repeated common-format sessions
for y,initial,fill,name,meta,last,badge,bg,fg,time,unread in [
 (sy+190,'林','#79a89a','秋季新品主图','邀请会话 · 等待对方加入','点开会话卡片即可分享邀请','待邀请','#eff6ff','#32805f','10:28',''),
 (sy+305,'茶','#c88c66','秋季茶饮主图','订单 TM-081 · 茶予山野','需求单已提交，等待双方确认','待确认','#fff0d9','#a46e27','10:24','2'),
 (sy+420,'朵','#7da7a1','春季详情页','订单 JD-029 · 朵云生活','设计师发来 2 张新方案','设计中','#e7f2eb','#3b805f','昨天','')]:
    rect(sx+17,y,319,101,'#fff',15,'#e2e8f0'); circle(sx+43,y+30,20,fill); txt(sx+43,y+35,initial,13,'#fff',700,'middle'); txt(sx+74,y+25,name,12,'#1e293b',700); txt(sx+74,y+45,meta,9,'#8a968d'); txt(sx+74,y+72,last,9,'#5f7064'); pill(sx+255,y+11,68,badge,bg,fg,22,9); txt(sx+300,y+89,time,8,'#9aa59c','400','end')
    if unread: circle(sx+318,y+68,9,'#e46855'); txt(sx+318,y+72,unread,8,'#fff',700,'middle')
rect(sx+17,sy+550,319,122,'#eef5ef',15); txt(sx+34,sy+580,'会话里确认，需求自动归档',12,'#2563eb',750); txt(sx+34,sy+603,'对话、表单、最终确认都留在同一条会话里。',9,'#718277'); pill(sx+34,sy+621,112,'了解会话流程','#fff','#2563eb',24,9)
nav(sx,sy,'会话')

# 3 Chat
sx,sy,_,_=phone(935,3,'会话聊天 · 可分享','会话')
txt(sx+20,sy+69,'‹',27,'#334155',500); txt(sx+52,sy+72,'秋季新品主图',15,'#1e293b',750); txt(sx+52,sy+92,'林小姐 · 等待对方加入',9,'#89968d'); circle(sx+321,sy+75,15,'#e7f2e8'); txt(sx+321,sy+80,'···',13,'#47836a',700,'middle')
rect(sx,sy+110,351,42,'#fff'); txt(sx+19,sy+136,'邀请会话',10,'#2563eb',700); txt(sx+332,sy+136,'7 天有效',9,'#89968d',500,'end'); line(sx,sy+152,sx+351,sy+152)
pill(sx+126,sy+169,98,'今天 10:24','#e9eee9','#89968d',22,9)
circle(sx+28,sy+219,14,'#c88c66'); txt(sx+28,sy+223,'茶',9,'#fff',700,'middle'); rect(sx+49,sy+201,237,53,'#fff',13,'#e2e8f0'); txt(sx+63,sy+222,'你好，我们想做一组秋季新品主图。',9,'#405348'); txt(sx+63,sy+239,'希望风格自然、轻盈。',9,'#405348')
rect(sx+95,sy+269,232,48,'#eff6ff',13); txt(sx+111,sy+290,'收到，我先帮你梳理需求。',9,'#2563eb'); txt(sx+111,sy+306,'我们可以边聊边补充需求单。',9,'#2563eb')
rect(sx+49,sy+337,285,121,'#fff',15,'#dbeafe'); pill(sx+63,sy+349,74,'需求表单','#eff6ff','#2563eb',20,9); txt(sx+63,sy+393,'秋季新品主图需求',13,'#1e293b',750); txt(sx+63,sy+416,'已填写 4 / 6 项 · 草稿已保存',9,'#718277'); line(sx+63,sy+427,sx+320,sy+427); txt(sx+63,sy+448,'继续填写   ›',10,'#2563eb',700)
pill(sx+98,sy+478,154,'对方已加入会话','#edf2ed','#7d8980',23,9)
rect(sx,sy+747,351,57,'#fff'); line(sx,sy+747,sx+351,sy+747); pill(sx+18,sy+758,78,'＋ 工具','#f1f5f9','#627269',27,9); pill(sx+104,sy+758,82,'需求单','#eff6ff','#2563eb',27,9); pill(sx+194,sy+758,75,'发图片','#f1f5f9','#627269',27,9); pill(sx+277,sy+758,58,'分享','#eff6ff','#2563eb',27,9)
rect(sx+15,sy+818,278,44,'#f8fafc',12,'#e2e8f0'); txt(sx+30,sy+845,'输入消息…',10,'#9aa69d'); rect(sx+301,sy+818,37,44,'url(#brand)',12); txt(sx+319,sy+847,'↑',18,'#fff',700,'middle')
rect(sx+129,sy+857,93,4,'#334155',2)

# 4 Form
sx,sy,_,_=phone(1375,4,'需求表单 · 分步填写','会话')
txt(sx+21,sy+70,'‹',27,'#334155',500); txt(sx+56,sy+72,'填写需求单',16,'#1e293b',750); txt(sx+326,sy+72,'保存',10,'#2563eb',650,'end')
txt(sx+21,sy+111,'秋季新品主图需求',13,'#334155',750); txt(sx+21,sy+132,'内容和素材越完整，设计沟通越顺畅',9,'#849087')
rect(sx+19,sy+150,313,6,'#e2e8f0',3); rect(sx+19,sy+150,209,6,'#32856a',3); txt(sx+19,sy+174,'第 2 步 / 3  ·  视觉方向',9,'#2563eb',650)
# fields
for y,label,value in [(sy+197,'核心卖点','例如：低糖、原叶萃取、秋季限定'),(sy+287,'目标人群','例如：关注健康的年轻消费者')]:
    txt(sx+21,y,label,10,'#42554a',650); rect(sx+19,y+12,313,45,'#fff',10,'#e2e8f0'); txt(sx+31,y+40,value,9,'#9ba69e')
txt(sx+21,sy+402,'期望视觉风格',10,'#42554a',650)
for x,label,active in [(sx+20,'自然清新',1),(sx+121,'高级质感',0),(sx+222,'活泼明亮',0)]:
    pill(x,sy+414,92,label,'#eff6ff' if active else '#fff','#2563eb' if active else '#77847a',28,9,'#bfdbfe' if active else '#e2e8f0')
txt(sx+21,sy+476,'上传参考图片',10,'#42554a',650); txt(sx+21,sy+496,'最多 6 张，可补充喜欢的风格或竞品参考',8,'#8c988f')
rect(sx+20,sy+511,82,82,'#f1f5f9',12,'#e2e8f0'); txt(sx+61,sy+554,'参考图',9,'#66806d',600,'middle'); txt(sx+61,sy+575,'已上传',8,'#90a095',400,'middle')
rect(sx+112,sy+511,82,82,'#f1f5f9',12,'#e2e8f0'); txt(sx+153,sy+554,'产品图',9,'#66806d',600,'middle'); txt(sx+153,sy+575,'已上传',8,'#90a095',400,'middle')
rect(sx+204,sy+511,82,82,'#fff',12,'#bfdbfe',1,'stroke-dasharray="4 3"'); txt(sx+245,sy+554,'＋',22,'#2563eb',400,'middle'); txt(sx+245,sy+575,'添加图片',8,'#779181',400,'middle')
rect(sx,sy+747,351,57,'#fff'); line(sx,sy+747,sx+351,sy+747); txt(sx+21,sy+771,'草稿自动保存',8,'#839087'); txt(sx+21,sy+789,'上次保存 10:32',8,'#a0aaa3'); rect(sx+199,sy+757,135,36,'url(#brand)',11); txt(sx+266,sy+780,'下一步：确认',10,'#fff',700,'middle'); rect(sx+129,sy+857,93,4,'#334155',2)

# 5 confirmation
sx,sy,_,_=phone(1815,5,'双方确认 · 版本清楚','会话')
txt(sx+21,sy+70,'‹',27,'#334155',500); txt(sx+56,sy+72,'需求确认',16,'#1e293b',750); txt(sx+326,sy+72,'v2',10,'#2563eb',650,'end')
rect(sx+18,sy+95,315,88,'#eff6ff',15); circle(sx+47,sy+124,15,'#32856a'); txt(sx+47,sy+129,'✓',12,'#fff',700,'middle'); txt(sx+73,sy+121,'需求单已提交',12,'#2563eb',750); txt(sx+73,sy+142,'等待双方确认后，成为本次设计依据',9,'#64816d'); txt(sx+32,sy+168,'候选版本 v2 · 基于 2 份表单与 1 次会话',8,'#778d7b')
txt(sx+21,sy+215,'本次需求摘要',13,'#1e293b',750); txt(sx+326,sy+215,'查看全部 →',9,'#2563eb',600,'end')
for y,label,value in [(sy+233,'交付内容','主图 3 张，详情页 1 套'),(sy+296,'核心卖点','低糖原叶 · 秋季限定'),(sy+359,'视觉方向','自然留白，暖茶绿为主'),(sy+422,'参考素材','产品图 4 张 · 风格参考 2 张')]:
    rect(sx+18,y,315,52,'#fff',11,'#e2e8f0'); txt(sx+31,y+21,label,9,'#8a978d'); txt(sx+31,y+40,value,10,'#334155',650)
rect(sx+18,sy+491,315,91,'#fff',14,'#e2e8f0'); txt(sx+32,sy+517,'双方确认进度',10,'#42554a',700); circle(sx+39,sy+545,9,'#32856a'); txt(sx+39,sy+549,'✓',8,'#fff',700,'middle'); txt(sx+56,sy+549,'品牌方 林小姐 · 已确认',8,'#4c6554'); circle(sx+190,sy+545,9,'#e2e8f0'); txt(sx+207,sy+549,'设计师 · 待确认',8,'#86938a')
pill(sx+18,sy+598,107,'变化 2 项','#fff1d8','#a66d27',23,9); txt(sx+137,sy+614,'点开可对比 v1 → v2',9,'#7c887f')
rect(sx+18,sy+747,151,47,'#fff',12,'#e2e8f0'); txt(sx+94,sy+776,'提出修改',10,'#65766a',650,'middle'); rect(sx+179,sy+747,154,47,'url(#brand)',12); txt(sx+256,sy+776,'确认需求',10,'#fff',700,'middle'); rect(sx+129,sy+857,93,4,'#334155',2)

# footer annotations
for i,(x,title,desc) in enumerate([
 (62,'01 · 先看到待办','进入首页就知道要填什么、确认什么。'),
 (502,'02 · 会话统一','订单与邀请会话采用同一列表与聊天样式。'),
 (942,'03 · 沟通即入口','会话里发起表单、分享小程序卡片与补充素材。'),
 (1382,'04 · 分步填表','轻量填写、即时存草稿，提交前清楚检查。'),
 (1822,'05 · 有依据地确认','显示版本、变化与双方进度，再确认锁定。')]):
    txt(x,1135,title,13,'#2563eb',750); txt(x,1161,desc,10,'#78857c')
rect(62,1203,2118,1,'#e2e8f0')
txt(62,1233,'设计方向：轻量、清晰、可信；主操作固定在底部，状态用文字与颜色双重表达。',11,'#61766a',550)
txt(2180,1233,'COZI · UNI-APP · CONCEPT',9,'#91a096',600,'end')
add('</svg>')
OUT.write_text(''.join(parts), encoding='utf-8')
print(OUT)
