# Macro de Capa - Puxada Y Automatica para Cima (Assistente de Recoil/Capa)
# Atalhos Globais: F2, F3, F6 ou F7 (Liga/Desliga a qualquer momento)
# Parametro Forca: 1 a 10 (quanto maior, mais forte a puxada para cima)
param(
    [int]$Forca = 4
)

$code = @"
using System;
using System.Runtime.InteropServices;
using System.Threading;

public class MacroEngine {
    [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
    [DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);

    private const int MOUSEEVENTF_MOVE = 0x0001;
    private const int VK_LBUTTON = 0x01; // Botao esquerdo do mouse (Atirar)
    private const int VK_F2      = 0x71; // Tecla F2
    private const int VK_F3      = 0x72; // Tecla F3
    private const int VK_F6      = 0x75; // Tecla F6
    private const int VK_F7      = 0x76; // Tecla F7

    public static void Run(int force) {
        // Tabela de forca otimizada (Forca 1 a 10)
        // Valores de Y negativos movem o cursor para CIMA na tela
        int[] pixelTable = { 3, 5, 7, 10, 13, 16, 20, 25, 30, 40 };
        int[] delayTable = { 8, 8, 7,  7,  6,  6,  5,  5,  4,  4 };

        int idx     = Math.Max(0, Math.Min(force - 1, 9));
        int stepY   = -pixelTable[idx];   // Negativo = Subir mira (Capa)
        int sleepMs = delayTable[idx];

        bool macroAtiva = true; // Inicia ATIVA

        while (true) {
            // Verifica atalhos de Toggle: F2, F3, F6 ou F7
            bool f2 = (GetAsyncKeyState(VK_F2) & 0x8000) != 0;
            bool f3 = (GetAsyncKeyState(VK_F3) & 0x8000) != 0;
            bool f6 = (GetAsyncKeyState(VK_F6) & 0x8000) != 0;
            bool f7 = (GetAsyncKeyState(VK_F7) & 0x8000) != 0;

            if (f2 || f3 || f6 || f7) {
                macroAtiva = !macroAtiva;
                try { Console.Beep(macroAtiva ? 1200 : 500, 120); } catch {}
                Thread.Sleep(300); // Debounce para evitar duplo clique
            }

            if (macroAtiva) {
                bool shooting = (GetAsyncKeyState(VK_LBUTTON) & 0x8000) != 0;
                if (shooting) {
                    mouse_event(MOUSEEVENTF_MOVE, 0, stepY, 0, 0);
                    Thread.Sleep(sleepMs);
                } else {
                    Thread.Sleep(5);
                }
            } else {
                Thread.Sleep(20);
            }
        }
    }
}
"@

Add-Type -TypeDefinition $code -Language CSharp
[MacroEngine]::Run($Forca)
