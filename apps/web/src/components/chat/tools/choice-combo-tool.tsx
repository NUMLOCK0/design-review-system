'use client';

import { useState } from 'react';
import { Puzzle } from 'lucide-react';
import { ToolButton } from './tool-ui';
import { ChoiceComboDialog } from './choice-combo-dialog';
import type { SendCard } from './tool-ui';

export function ChoiceComboTool({ orderId, onSent, intakeMode = false, onSend }: { orderId: string; onSent: () => void; intakeMode?: boolean; onSend: SendCard }) {
  const [open, setOpen] = useState(false);
  return <>
    <ToolButton icon={Puzzle} label="组合发单" description={intakeMode ? '选择多个业务问题，发送为当前会话的协作清单' : '从管理员发布的表单中自由组合问题'} onClick={() => setOpen(true)} />
    {open && <ChoiceComboDialog orderId={orderId} onClose={() => setOpen(false)} onSent={onSent} intakeMode={intakeMode} onSend={onSend} />}
  </>;
}
