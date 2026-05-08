import os
import re
import subprocess
import tempfile
import time
from typing import Optional

# ──────────────── BLOCKED PREDICATES ────────────────
BLOCKED_PATTERNS = [
    r'\bshell\s*\(',
    r'\bprocess_create\s*\(',
    r'\bopen\s*\([^,]+,\s*(write|append|update)',
    r'\bdelete_file\s*\(',
    r'\brename_file\s*\(',
    r'\bmake_directory\s*\(',
    r'\bset_prolog_flag\s*\(\s*bounded',
    r':\-\s*initialization',
    r'\bthread_create\s*\(',
]

BLOCKED_RE = [re.compile(p) for p in BLOCKED_PATTERNS]

BLOCKED_MESSAGE = """ERROR: Predicado bloqueado por razones de seguridad.
Los siguientes predicados no están permitidos:
  shell/1,2 - process_create/3 - open/3 (escritura)
  delete_file/1 - rename_file/2 - make_directory/1
  thread_create/3 - initialization/1
"""


def _check_safety(code: str, query: str) -> Optional[str]:
    """Returns an error message if dangerous code is detected, else None."""
    full_text = code + "\n" + query
    for pattern in BLOCKED_RE:
        match = pattern.search(full_text)
        if match:
            return f"ERROR DE SEGURIDAD: Predicado no permitido detectado: '{match.group()}'"
    return None


def _extract_vars(query: str) -> list[str]:
    """Extract Prolog variable names (uppercase start) from a query string."""
    # Match uppercase-starting identifiers, exclude _
    candidates = re.findall(r'\b([A-Z][a-zA-Z0-9_]*)\b', query)
    # Deduplicate while preserving order
    seen = set()
    result = []
    for v in candidates:
        if v not in seen:
            seen.add(v)
            result.append(v)
    return result


def _build_goal_script(code_file: str, query: str) -> str:
    """
    Generate a SWI-Prolog goal script that prints results in standard format:
    - Ground query (no vars): prints  true.  or  false.
    - Query with variables:   prints  X = foo  /  X = bar  etc.
    """
    prolog_vars = _extract_vars(query)

    if not prolog_vars:
        # Ground query — just check succeeds or fails
        query_body = f"""
    Query = ({query}),
    ( catch(call_with_time_limit(10, Query), TimeErr,
            (format('ERROR: ~w~n', [TimeErr]), halt(0))) ->
        writeln('true.')
    ;
        writeln('false.')
    )"""
    else:
        # Build a format string like "X = ~w,  Y = ~w"
        fmt_parts = [f"{v} = ~w" for v in prolog_vars]
        fmt_str   = ",\\n".join(fmt_parts)          # one var per line
        fmt_args  = "[" + ", ".join(prolog_vars) + "]"

        # We collect solutions manually with fail/backtrack loop,
        # printing each binding set, then check if at least one was found.
        query_body = f"""
    nb_setval(sol_count, 0),
    catch(
        call_with_time_limit(10, (
            ( ({query}),
              nb_getval(sol_count, C0), C1 is C0 + 1, nb_setval(sol_count, C1),
              format('{fmt_str}~n', {fmt_args}),
              fail
            ; true )
        )),
        TimeErr,
        format('ERROR: ~w~n', [TimeErr])
    ),
    nb_getval(sol_count, Total),
    ( Total =:= 0 -> writeln('false.') ; true )"""

    return f"""\
:- set_prolog_flag(verbose, silent).

run_query :-
    File = '{code_file}',
    ( catch(consult(File), ConsultErr,
            (format('CONSULT ERROR: ~w~n', [ConsultErr]), halt(1))) ),
    {query_body}.

:- run_query, halt(0).
:- halt(1).
"""


def execute_prolog(code: str, query: str, timeout: int = 15) -> dict:
    """
    Safely executes SWI-Prolog code with the given query.
    Returns: { output, error, success, execution_time_ms }
    """
    start = time.monotonic()

    # 1. Security check
    safety_error = _check_safety(code, query)
    if safety_error:
        return {
            "output": "",
            "error": BLOCKED_MESSAGE,
            "success": False,
            "execution_time_ms": 0,
        }

    # 2. Write files to temp directory
    with tempfile.TemporaryDirectory(prefix="prolog_") as tmpdir:
        code_file = os.path.join(tmpdir, "program.pl")
        with open(code_file, "w", encoding="utf-8") as f:
            f.write(code)

        goal_script = _build_goal_script(code_file, query)
        goal_file = os.path.join(tmpdir, "goal.pl")
        with open(goal_file, "w", encoding="utf-8") as f:
            f.write(goal_script)

        # 3. Execute with resource limits
        try:
            env = {
                "PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
                "HOME": tmpdir,
                "TMPDIR": tmpdir,
            }
            result = subprocess.run(
                [
                    "swipl",
                    "--quiet",
                    "--stack-limit=128m",
                    "--table-space=64m",
                    "-f", goal_file,
                ],
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=tmpdir,
                env=env,
            )
            elapsed_ms = int((time.monotonic() - start) * 1000)
            success = result.returncode == 0
            output = result.stdout.strip()
            error = result.stderr.strip()

            return {
                "output": output,
                "error": error,
                "success": success,
                "execution_time_ms": elapsed_ms,
            }

        except subprocess.TimeoutExpired:
            elapsed_ms = int((time.monotonic() - start) * 1000)
            return {
                "output": "",
                "error": f"⏱ Tiempo límite de ejecución excedido ({timeout} segundos). "
                         "Verifica si hay bucles infinitos en tu código.",
                "success": False,
                "execution_time_ms": elapsed_ms,
            }
        except FileNotFoundError:
            return {
                "output": "",
                "error": "ERROR: SWI-Prolog (swipl) no está instalado en el servidor.",
                "success": False,
                "execution_time_ms": 0,
            }
