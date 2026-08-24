// Versão web do campo de assinatura.
// react-native-signature-canvas usa react-native-webview por baixo, que
// não existe no navegador ("React Native WebView does not support this
// platform"). Aqui implementamos o mesmo desenho (assinar com o dedo/mouse)
// usando um <canvas> HTML puro, expondo a mesma interface via ref
// (readSignature / clearSignature) que a tela de assinatura já usa.
import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { View } from 'react-native';

type SignaturePadProps = {
  onOK?: (dataUrl: string) => void;
  onEmpty?: () => void;
  onError?: (err: unknown) => void;
  onLoadEnd?: () => void;
  penColor?: string;
  backgroundColor?: string;
  [key: string]: any;
};

const SignaturePad = forwardRef<any, SignaturePadProps>(function SignaturePad(
  { onOK, onEmpty, onLoadEnd, penColor = '#000000', backgroundColor = '#ffffff' },
  ref
) {
  const containerRef = useRef<any>(null);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasDrawnRef = useRef(false);

  useEffect(() => {
    const containerNode: HTMLElement | null = containerRef.current;
    if (!containerNode) return undefined;

    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.touchAction = 'none';
    containerNode.appendChild(canvas);
    canvasElRef.current = canvas;

    function limparFundo() {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = penColor;
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }

    function ajustarTamanho() {
      const rect = containerNode!.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width));
      canvas.height = Math.max(1, Math.round(rect.height));
      limparFundo();
      hasDrawnRef.current = false;
    }

    ajustarTamanho();
    window.addEventListener('resize', ajustarTamanho);

    let lastX = 0;
    let lastY = 0;

    function posicao(e: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function aoDescer(e: PointerEvent) {
      drawingRef.current = true;
      const { x, y } = posicao(e);
      lastX = x;
      lastY = y;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // alguns navegadores/mobile podem não suportar; ignora
      }
    }

    function aoMover(e: PointerEvent) {
      if (!drawingRef.current) return;
      const ctx = canvas.getContext('2d');
      const { x, y } = posicao(e);
      if (ctx) {
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
      lastX = x;
      lastY = y;
      hasDrawnRef.current = true;
    }

    function aoSoltar() {
      drawingRef.current = false;
    }

    canvas.addEventListener('pointerdown', aoDescer);
    canvas.addEventListener('pointermove', aoMover);
    window.addEventListener('pointerup', aoSoltar);

    onLoadEnd?.();

    return () => {
      window.removeEventListener('resize', ajustarTamanho);
      canvas.removeEventListener('pointerdown', aoDescer);
      canvas.removeEventListener('pointermove', aoMover);
      window.removeEventListener('pointerup', aoSoltar);
      containerNode.removeChild(canvas);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [penColor, backgroundColor]);

  useImperativeHandle(ref, () => ({
    readSignature: () => {
      const canvas = canvasElRef.current;
      if (!canvas || !hasDrawnRef.current) {
        onEmpty?.();
        return;
      }
      const dataUrl = canvas.toDataURL('image/png');
      onOK?.(dataUrl);
    },
    clearSignature: () => {
      const canvas = canvasElRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      hasDrawnRef.current = false;
    },
  }));

  return <View ref={containerRef} style={{ flex: 1 }} />;
});

export default SignaturePad;
