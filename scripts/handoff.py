#!/usr/bin/env python3
"""
scripts/handoff.py — Bus de Estado y Sincronización Inter-Agente (Claude Code <-> The Source / Gemini)

Maneja el protocolo de turnos mediante un archivo compartido (handoff.json) con:
- Escritura atómica (sin archivos truncados ni race conditions).
- Espera pasiva con timeout seguro.
- Preservación de mensajes estructurados (DE: / PARA: / ESTADO:).
- Historial acumulativo y límite de iteraciones (circuit-breaker).
"""

import os
import sys
import json
import time
import argparse
from datetime import datetime

DEFAULT_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "handoff.json"))

DEFAULT_INITIAL_DATA = {
    "version": "1.0",
    "turno": "claude",
    "iteracion_actual": 0,
    "max_iteraciones": 10,
    "estado": "EN_PROGRESO",
    "requiere_firma_neo": False,
    "objetivo": "Sesión de trabajo autónomo",
    "ultimo_emisor": "neo",
    "mensaje": "DE: Neo (Andrés Vallejo)\nPARA: Morpheus (Capitán de la Nabucodonosor)\nESTADO: En progreso\nDETALLE:\n- Despierta sesión en el proyecto activo y reporta el estado actual de la cola de tareas.\nSIGUIENTE PASO RECOMENDADO: Morpheus reporta el estado y cede el turno en el bus a Neo.",
    "historial": []
}

def atomic_write(path, data):
    tmp_path = f"{path}.tmp.{os.getpid()}"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp_path, path)

def ensure_handoff_exists(path):
    if not os.path.exists(path):
        atomic_write(path, DEFAULT_INITIAL_DATA)
        print(f"[handoff] Auto-inicializado handoff.json en {path}")

def load_handoff(path):
    ensure_handoff_exists(path)
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError:
        return None

def cmd_init(args):
    data = {
        "version": "1.0",
        "turno": args.turno,
        "iteracion_actual": 0,
        "max_iteraciones": args.max_iter,
        "estado": "EN_PROGRESO",
        "requiere_firma_neo": False,
        "objetivo": args.objetivo,
        "ultimo_emisor": args.emisor,
        "mensaje": args.mensaje,
        "historial": []
    }
    atomic_write(args.path, data)
    print(f"[handoff] Inicializado exitosamente en {args.path}")
    print(f"[handoff] Turno inicial: {args.turno} | Max iteraciones: {args.max_iter}")

def cmd_read(args):
    data = load_handoff(args.path)
    if not data:
        print(f"[handoff] Error: No existe {args.path} o está corrupto.", file=sys.stderr)
        sys.exit(1)
    if args.field:
        # Campo virtual 'directiva': retorna la última instrucción de trabajo real, saltándose pausas intermedias
        if args.field == "directiva":
            msg = data.get("mensaje", "")
            if not msg.startswith("PAUSA_") and not msg.startswith("╔") and "DE:" in msg:
                print(msg)
                return
            for h in reversed(data.get("historial", [])):
                m = h.get("mensaje", "")
                if not m.startswith("PAUSA_") and not m.startswith("╔") and "DE:" in m:
                    print(m)
                    return
            print(msg)
            return

        val = data.get(args.field)
        if isinstance(val, (dict, list)):
            print(json.dumps(val, indent=2, ensure_ascii=False))
        else:
            print(val)
    else:
        print(json.dumps(data, indent=2, ensure_ascii=False))

def cmd_write(args):
    data = load_handoff(args.path)
    if not data:
        print(f"[handoff] Error: Archivo {args.path} no existe. Usa 'init' primero.", file=sys.stderr)
        sys.exit(1)

    # Si hay mensaje previo, archivarlo en historial (preservando pausas para auditoría, pero sin duplicar instrucciones idénticas)
    mensaje_previo = data.get("mensaje", "")
    if mensaje_previo:
        historial = data.get("historial", [])
        ultimo_historial = historial[-1].get("mensaje", "") if historial else ""
        es_duplicado = (mensaje_previo.strip() == ultimo_historial.strip()) or (args.mensaje and args.mensaje.strip() == mensaje_previo.strip())

        if not es_duplicado:
            entrada_historial = {
                "timestamp": datetime.now().isoformat(),
                "iteracion": data.get("iteracion_actual", 0),
                "emisor": data.get("ultimo_emisor", "desconocido"),
                "mensaje": mensaje_previo
            }
            historial.append(entrada_historial)
            data["historial"] = historial

    # Incrementar iteración si se cede el turno
    if args.turno and args.turno != data.get("turno"):
        data["iteracion_actual"] = data.get("iteracion_actual", 0) + 1
        data["turno"] = args.turno

    if args.emisor:
        data["ultimo_emisor"] = args.emisor
    if args.mensaje:
        data["mensaje"] = args.mensaje
    if args.estado:
        data["estado"] = args.estado
    if args.requiere_firma is not None:
        data["requiere_firma_neo"] = args.requiere_firma

    # Comprobación de circuit breaker
    if data.get("iteracion_actual", 0) >= data.get("max_iteraciones", 10):
        if data["estado"] == "EN_PROGRESO":
            data["estado"] = "PAUSA_CIRCUIT_BREAKER"
            print(f"[handoff] Límite de {data['max_iteraciones']} iteraciones alcanzado. Pausando bus.")

    atomic_write(args.path, data)
    print(f"[handoff] Turno actualizado a: {data['turno']} (Iteración {data['iteracion_actual']}/{data['max_iteraciones']})")
    print(f"[handoff] Estado: {data['estado']}")

def cmd_wait(args):
    start = time.time()
    esperado = args.esperar_a.lower()
    timeout = args.timeout
    intervalo = args.intervalo

    print(f"[handoff] Esperando turno para '{esperado}' (timeout: {timeout}s)...")
    while True:
        data = load_handoff(args.path)
        if data:
            turno_actual = str(data.get("turno", "")).lower()
            estado = data.get("estado", "")
            iter_actual = data.get("iteracion_actual", 0)
            max_iter = data.get("max_iteraciones", 10)

            # Condición de activación: es nuestro turno
            es_mismo_bando_source = esperado in ["source", "gemini", "neo"] and turno_actual in ["source", "gemini", "neo"]
            if turno_actual == esperado or es_mismo_bando_source:
                print(f"[handoff] ¡Turno concedido a '{esperado}'! (Iteración {iter_actual}/{max_iter})")
                sys.exit(0)

            # Condición de detención: el bus se pausó o completó
            if estado in ["COMPLETADO", "PAUSA_NEO", "PAUSA_CIRCUIT_BREAKER"]:
                print(f"[BUS DETENIDO] El bus handoff.json se detuvo con estado: '{estado}'.")
                sys.exit(2)

            # Condición de detención: límite de iteraciones
            if iter_actual >= max_iter:
                print(f"[BUS DETENIDO] Máximo de iteraciones alcanzado ({iter_actual}/{max_iter}). Deteniendo.")
                sys.exit(2)

        elapsed = time.time() - start
        if elapsed >= timeout:
            print(f"[TIMEOUT] Se agotó el tiempo de espera ({timeout}s) en el bus handoff.json esperando a '{esperado}'. El bucle autónomo se ha detenido.", file=sys.stderr)
            sys.exit(1)

        time.sleep(intervalo)

def main():
    parser = argparse.ArgumentParser(description="Bus de Estado Handoff para Diálogo Inter-Agente")
    parser.add_argument("--path", default=DEFAULT_PATH, help=f"Ruta al archivo handoff.json (default: {DEFAULT_PATH})")
    subparsers = parser.add_subparsers(dest="subcmd", required=True)

    # Subcomando: init
    p_init = subparsers.add_parser("init", help="Inicializa un nuevo ciclo de handoff")
    p_init.add_argument("--turno", default="claude", choices=["claude", "gemini", "source", "neo"], help="Quién tiene el primer turno")
    p_init.add_argument("--max-iter", type=int, default=5, help="Número máximo de iteraciones permitidas")
    p_init.add_argument("--objetivo", required=True, help="Objetivo de la sesión")
    p_init.add_argument("--emisor", default="neo", help="Nombre del emisor inicial")
    p_init.add_argument("--mensaje", default="", help="Mensaje inicial")

    # Subcomando: read
    p_read = subparsers.add_parser("read", help="Lee el estado actual de handoff")
    p_read.add_argument("--field", help="Campo específico a extraer (turno, mensaje, estado, etc.)")

    # Subcomando: write
    p_write = subparsers.add_parser("write", help="Actualiza el estado de handoff")
    p_write.add_argument("--turno", choices=["claude", "gemini", "source", "neo"], help="Nuevo turno")
    p_write.add_argument("--emisor", help="Nombre del personaje/agente que escribe")
    p_write.add_argument("--mensaje", help="Cuerpo del mensaje")
    p_write.add_argument("--estado", choices=["EN_PROGRESO", "COMPLETADO", "PAUSA_NEO", "BLOQUEADO"], help="Estado del ciclo")
    p_write.add_argument("--requiere-firma", action=argparse.BooleanOptionalAction, default=None, help="Indica si requiere firma de Neo")

    # Subcomando: wait
    p_wait = subparsers.add_parser("wait", help="Espera de forma bloqueante a que sea el turno especificado")
    p_wait.add_argument("--for", dest="esperar_a", required=True, choices=["claude", "gemini", "source", "neo"], help="Turno que estamos esperando")
    p_wait.add_argument("--timeout", type=int, default=600, help="Segundos máximos de espera (default: 600s)")
    p_wait.add_argument("--intervalo", type=int, default=2, help="Intervalo de consulta en segundos (default: 2s)")

    args = parser.parse_args()

    if args.subcmd == "init":
        cmd_init(args)
    elif args.subcmd == "read":
        cmd_read(args)
    elif args.subcmd == "write":
        cmd_write(args)
    elif args.subcmd == "wait":
        cmd_wait(args)

if __name__ == "__main__":
    main()
