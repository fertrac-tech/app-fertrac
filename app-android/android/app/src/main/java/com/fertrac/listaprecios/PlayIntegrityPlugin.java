package com.fertrac.listaprecios;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.integrity.IntegrityManagerFactory;
import com.google.android.play.core.integrity.StandardIntegrityManager;
import com.google.android.play.core.integrity.StandardIntegrityManager.PrepareIntegrityTokenRequest;
import com.google.android.play.core.integrity.StandardIntegrityManager.StandardIntegrityTokenProvider;
import com.google.android.play.core.integrity.StandardIntegrityManager.StandardIntegrityTokenRequest;

/**
 * SEC-02.3 · Play Integrity (Standard API) para la Lista de Precios.
 *
 * La web (app.fertrac.com) lo llama como Capacitor.Plugins.PlayIntegrity.requestToken({ requestHash })
 * al iniciar sesión; requestHash = SHA-256 del ID token de Google, así la atestación queda ligada a
 * ESE inicio de sesión. El backend (gs/Seguridad.gs → verificarIntegridadPlay_) decodifica el token
 * con la API de Google y valida paquete, certificado de firma, requestHash y dispositivo.
 *
 * Inactivo mientras play_integrity_cloud_project_number = 0 (strings.xml): rechaza con
 * "no_configurado" y la web inicia sesión sin token (el backend decide con PLAY_INTEGRITY.ACTIVO).
 */
@CapacitorPlugin(name = "PlayIntegrity")
public class PlayIntegrityPlugin extends Plugin {

    private StandardIntegrityTokenProvider tokenProvider;

    private long cloudProjectNumber() {
        try {
            return Long.parseLong(getContext().getString(R.string.play_integrity_cloud_project_number).trim());
        } catch (Exception e) {
            return 0L;
        }
    }

    @PluginMethod
    public void requestToken(PluginCall call) {
        String requestHash = call.getString("requestHash", "");
        if (requestHash == null || requestHash.isEmpty() || requestHash.length() > 500) {
            call.reject("request_hash_invalido");
            return;
        }
        long project = cloudProjectNumber();
        if (project <= 0) {
            call.reject("no_configurado");
            return;
        }
        if (tokenProvider != null) {
            request(call, requestHash, true);
            return;
        }
        StandardIntegrityManager manager = IntegrityManagerFactory.createStandard(getContext());
        manager.prepareIntegrityToken(PrepareIntegrityTokenRequest.builder().setCloudProjectNumber(project).build())
            .addOnSuccessListener(provider -> {
                tokenProvider = provider;
                request(call, requestHash, false);
            })
            .addOnFailureListener(e -> call.reject("preparacion_fallida", e));
    }

    private void request(PluginCall call, String requestHash, boolean retryOnFailure) {
        tokenProvider.request(StandardIntegrityTokenRequest.builder().setRequestHash(requestHash).build())
            .addOnSuccessListener(response -> {
                JSObject result = new JSObject();
                result.put("token", response.token());
                call.resolve(result);
            })
            .addOnFailureListener(e -> {
                tokenProvider = null;                      // el proveedor puede vencer: se prepara de nuevo una vez
                if (retryOnFailure) requestToken(call);
                else call.reject("solicitud_fallida", e);
            });
    }
}
