package com.fertrac.listaprecios;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    // Plugin local de Play Integrity (SEC-02.3). Debe registrarse antes de super.onCreate.
    registerPlugin(PlayIntegrityPlugin.class);
    super.onCreate(savedInstanceState);
    // Bloquea capturas y grabaciones de pantalla (salen en negro) y oculta
    // el contenido en la vista de apps recientes. Protege la lista de precios.
    getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE,
                         WindowManager.LayoutParams.FLAG_SECURE);
  }
}
