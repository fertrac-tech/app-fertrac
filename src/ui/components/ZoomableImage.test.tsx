import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ZoomableImage, ZOOM, clampScale, fitFrame, isZoomed, toPercent } from './ZoomableImage';

describe('reglas de zoom', () => {
  it('limita la escala entre 100 % y 400 %', () => {
    expect(clampScale(0.3)).toBe(ZOOM.min);
    expect(clampScale(9)).toBe(ZOOM.max);
    expect(clampScale(2)).toBe(2);
  });

  it('muestra el porcentaje redondeado y detecta zoom', () => {
    expect(toPercent(1)).toBe('100%');
    expect(toPercent(2.456)).toBe('246%');
    expect(isZoomed(1)).toBe(false);
    expect(isZoomed(1.5)).toBe(true);
  });

  it('un clic de rueda del mouse (deltaY ≈ 100) avanza 25 %, no salta al máximo', () => {
    expect(ZOOM.wheelStep * 100).toBeCloseTo(0.25);
    expect(ZOOM.min + ZOOM.wheelStep * 100).toBeLessThan(ZOOM.max);
  });

  it('el marco fijo toma el tamaño de la foto ajustada al área', () => {
    expect(fitFrame({ w: 1600, h: 1200 }, { w: 400, h: 600 })).toEqual({ w: 400, h: 300 }); // limita el ancho
    expect(fitFrame({ w: 800, h: 1600 }, { w: 400, h: 600 })).toEqual({ w: 300, h: 600 }); // limita el alto
    expect(fitFrame({ w: 0, h: 0 }, { w: 400, h: 600 })).toBeNull(); // foto sin cargar
  });
});

describe('ZoomableImage', () => {
  it('arranca sin zoom: alejar y 1:1 deshabilitados, acercar habilitado', () => {
    render(<ZoomableImage src="foto.jpg" alt="Filtro aceite" />);
    expect(screen.getByRole('img', { name: 'Filtro aceite' })).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(screen.getByRole('button', { name: 'Alejar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Tamaño original' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Acercar' })).toBeEnabled();
    const slider = screen.getByRole('slider', { name: 'Nivel de zoom' });
    expect(slider).toHaveValue('100');
    expect(slider).toHaveAttribute('min', '100');
    expect(slider).toHaveAttribute('max', '400');
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('pasa el error de carga al visor (respaldo de la foto)', () => {
    const onError = vi.fn();
    render(<ZoomableImage src="foto.jpg" alt="Filtro aceite" onError={onError} />);
    fireEvent.error(screen.getByRole('img'));
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('tocar fuera del marco sin zoom avisa al visor; tocar el marco o la barra no', async () => {
    const onBackdropClick = vi.fn();
    const { container } = render(<ZoomableImage src="foto.jpg" alt="Filtro aceite" onBackdropClick={onBackdropClick} />);
    fireEvent.click(container.querySelector('.zoomable__wrapper') as HTMLElement); // dentro del marco
    await userEvent.click(screen.getByRole('slider', { name: 'Nivel de zoom' })); // barra
    expect(onBackdropClick).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector('.zoomable__area') as HTMLElement); // fuera del marco
    expect(onBackdropClick).toHaveBeenCalledTimes(1);
  });
});
