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

        [DllImport("winmm.dll")]
        public static extern uint timeBeginPeriod(uint uMilliseconds);

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
                    if (parsed > 0.0) speed = parsed;
                }
            }

            if (speed < 0.1) speed = 0.1;
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
                if (loopCounter % 5 == 0)
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
                        // Escala proporcional calibrada com precisao:
                        // 0.1: accumula 0.018 por tick (~550ms por pixel -> devagar quase parando)
                        // 0.2: accumula 0.036 por tick (~270ms por pixel -> um pouquinho mais rapido)
                        // 0.5: accumula 0.090 por tick (~110ms por pixel)
                        // 1.0: accumula 0.180 por tick (~55ms por pixel)
                        // 2.5: accumula 0.450 por tick (~22ms por pixel)
                        // 5.0: accumula 0.900 por tick (~11ms por pixel)
                        // 10.0: descida forte e rapida
                        accumY += (speed * 0.18);

                        if (accumY >= 1.0)
                        {
                            int stepY = (int)Math.Floor(accumY);
                            mouse_event(MOUSEEVENTF_MOVE, 0, stepY, 0, 0);
                            accumY -= stepY;
                        }

                        Thread.Sleep(10);
                    }
                    else
                    {
                        accumY = 0.0;
                        Thread.Sleep(10);
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
