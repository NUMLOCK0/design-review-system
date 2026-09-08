'use client';

import SliderCaptcha, { type VerifyParam } from 'rc-slider-captcha';
import { useRef } from 'react';
import { fetchWithAuth } from '@/lib/auth';

interface SliderCaptchaProps {
  onVerified: (token: string) => void;
}

export function SmsSliderCaptcha({ onVerified }: SliderCaptchaProps) {
  const challengeId = useRef('');

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-2">
      <SliderCaptcha
        bgSize={{ width: 320, height: 160 }}
        puzzleSize={{ width: 56, height: 56, left: 0, top: 55 }}
        request={async () => {
          const response = await fetchWithAuth('/auth/captcha/challenge');
          const result = await response.json();
          if (!response.ok || !result.success) throw new Error(result.message || '验证码加载失败');
          challengeId.current = result.data.challengeId;
          return { bgUrl: result.data.bgUrl, puzzleUrl: result.data.puzzleUrl };
        }}
        onVerify={async (data: VerifyParam) => {
          const response = await fetchWithAuth('/auth/captcha/verify', {
            method: 'POST',
            body: JSON.stringify({ challengeId: challengeId.current, ...data })
          });
          const result = await response.json();
          if (!response.ok || !result.success) throw new Error(result.message || '验证失败');
          onVerified(result.data.token);
        }}
        tipText={{ default: '向右拖动滑块完成验证', success: '验证成功' }}
        limitErrorCount={5}
        autoRefreshOnError
        className="mx-auto"
      />
    </div>
  );
}
