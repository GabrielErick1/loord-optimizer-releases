using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

namespace LoordOptimizer
{
    public static class Program
    {
        [DllImport("user32.dll")]
        public static extern short GetAsyncKeyState(int vKey);

        [DllImport("user32.dll")]
        public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);

        [DllImport("user32.dll")]
        public static extern bool GetCursorPos(out POINT lpPoint);

        [DllImport("user32.dll")]
        public static extern bool SetCursorPos(int X, int Y);

        [DllImport("user32.dll")]
        public static extern bool MessageBeep(uint uType);

        [DllImport("winmm.dll")]
        public static extern uint timeBeginPeriod(uint uMilliseconds);

        public struct POINT
        {
            public int X;
            public int Y;
        }

        private const int MOUSEEVENTF_MOVE = 0x0001;
        private const int VK_LBUTTON = 0x01; // Botao Esquerdo (Atirar / Disparo)

        [STAThread]
        public static void Main(string[] args)
        {
            try
            {
                timeBeginPeriod(1);
            }
            catch { }

            double speed = 0.5;
            if (args != null && args.Length > 0)
            {
                double parsed;
                if (double.TryParse(args[0].Replace(',', '.'), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out parsed))
                {
                    speed = parsed;
                }
            }

            if (speed <= 0.0) speed = 0.1;
            if (speed > 50.0) speed = 50.0;

            bool macroAtiva = false;
            double accumY = 0.0;
            string configSpeedPath = Path.Combine(Path.GetTempPath(), "loord_macro_speed.txt");
            string configActivePath = Path.Combine(Path.GetTempPath(), "loord_macro_active.txt");
            int loopCounter = 0;

            while (true)
            {
                loopCounter++;

                // Sincroniza estado e velocidade com o painel a cada ~50ms
                if (loopCounter % 8 == 0)
                {
                    try
                    {
                        if (File.Exists(configActivePath))
                        {
                            using (var fs = new FileStream(configActivePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                            using (var reader = new StreamReader(fs))
                            {
                                string act = reader.ReadToEnd().Trim().ToLower();
                                if (act == "true" || act == "1") macroAtiva = true;
                                else if (act == "false" || act == "0") macroAtiva = false;
                            }
                        }
                    }
                    catch { }

                    try
                    {
                        if (File.Exists(configSpeedPath))
                        {
                            using (var fs = new FileStream(configSpeedPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                            using (var reader = new StreamReader(fs))
                            {
                                string cfg = reader.ReadToEnd().Trim().Replace(',', '.');
                                double newSpd;
                                if (double.TryParse(cfg, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out newSpd))
                                {
                                    if (newSpd > 0.0) speed = newSpd;
                                }
                            }
                        }
                    }
                    catch { }
                }

                if (macroAtiva)
                {
                    // Verifica se o botao esquerdo do mouse esta pressionado
                    bool isShooting = (GetAsyncKeyState(VK_LBUTTON) < 0);
                    if (isShooting)
                    {
                        // Escala proporcional real:
                        // 0.1: quase imperceptivel / muito lenta (para controle fino)
                        // 0.2: lenta e suave
                        // 0.5: moderada
                        // 1.0: recomendada
                        // 2.5: media-alta
                        // 5.0: forte
                        // 10.0: maxima
                        accumY += (speed * 0.5);
                        if (accumY >= 1.0)
                        {
                            int stepY = (int)Math.Floor(accumY);

                            // 1) Envia movimento relativo para jogos 3D / DirectInput / Emuladores
                            mouse_event(MOUSEEVENTF_MOVE, 0, stepY, 0, 0);

                            // 2) Ajusta cursor do Windows (garante movimento visual no Desktop / 2D)
                            POINT cur;
                            if (GetCursorPos(out cur))
                            {
                                SetCursorPos(cur.X, cur.Y + stepY);
                            }

                            accumY -= stepY;
                        }
                        Thread.Sleep(8);
                    }
                    else
                    {
                        accumY = 0.0;
                        Thread.Sleep(6);
                    }
                }
                else
                {
                    accumY = 0.0;
                    Thread.Sleep(20);
                }
            }
        }
    }
}
