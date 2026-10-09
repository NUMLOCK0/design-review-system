'use client';

import { useState } from 'react';
import { Puzzle } from 'lucide-react';
import { ToolButton } from './tool-ui';
import { ChoiceComboDialog } from './choice-combo-dialog';

export function ChoiceComboTool({ orderId, onSent }: { orderId: string; onSent: () => void }) {
  const [open, setOpen] = useState(false);
  return <>
    <ToolButton icon={Puzzle} label="组合发单" description="跨 13 类业务自由勾选问题，生成可填写的组合表单" onClick={() => setOpen(true)} />
    {open && <ChoiceComboDialog orderId={orderId} onClose={() => setOpen(false)} onSent={onSent} />}
  </>;
}
