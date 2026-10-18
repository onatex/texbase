// Router para la demo: dentro del visor de artefactos la URL no se puede
// cambiar, así que la navegación vive en memoria. También redirige los enlaces
// internos (<a href="/exclusiva/..."> con target="_blank") al router.
import React, { useEffect, useState } from 'react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import './runtime';
import { DEMO_PASSWORD, demoStatus } from './pocketbaseDemo';

function EnlacesInternos() {
	const navigate = useNavigate();
	useEffect(() => {
		const onClick = (e) => {
			const a = e.target.closest?.('a[href^="/"]');
			if (!a || a.getAttribute('href').startsWith('/_blob/')) return;
			e.preventDefault();
			navigate(a.getAttribute('href'));
		};
		document.addEventListener('click', onClick, true);
		return () => document.removeEventListener('click', onClick, true);
	}, [navigate]);
	return null;
}

function AvisoDemo() {
	const navigate = useNavigate();
	const [abierto, setAbierto] = useState(true);
	const [avisos, setAvisos] = useState([]);
	useEffect(() => {
		const t = setInterval(() => {
			const list = [...demoStatus.warnings];
			if (demoStatus.db === 'sin-acceso') list.unshift('Sin acceso a los datos compartidos: abre la demo desde claude.ai con tu cuenta.');
			setAvisos((prev) => (prev.join('|') === list.join('|') ? prev : list));
		}, 2000);
		return () => clearInterval(t);
	}, []);
	return (
		<div style={{ position: 'fixed', zIndex: 60, right: 'max(12px, env(safe-area-inset-right, 0px))', bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}
			className="max-w-[min(92vw,340px)] rounded-lg border border-border bg-card text-card-foreground shadow-lg text-xs">
			{abierto ? (
				<div className="p-3 flex flex-col gap-2">
					<div className="flex items-start justify-between gap-3">
						<p className="font-semibold uppercase tracking-wide text-[11px] text-muted-foreground">Versión de prueba</p>
						<button type="button" onClick={() => setAbierto(false)} className="text-muted-foreground hover:text-foreground" aria-label="Ocultar aviso">✕</button>
					</div>
					<p>Datos de ejemplo, compartidos por todos los que abren esta página. Contraseña de cualquier usuario: <b className="font-mono select-all">{DEMO_PASSWORD}</b></p>
					{avisos.map((a) => <p key={a} className="text-destructive">{a}</p>)}
					<button type="button" onClick={() => navigate('/cliente')} className="self-start underline text-primary">Ver panel de cliente</button>
				</div>
			) : (
				<button type="button" onClick={() => setAbierto(true)} className="px-3 py-2 font-semibold">Demo{avisos.length ? ' ⚠' : ''}</button>
			)}
		</div>
	);
}

export default function DemoRouter({ children }) {
	return (
		<MemoryRouter>
			<EnlacesInternos />
			{children}
			<AvisoDemo />
		</MemoryRouter>
	);
}
