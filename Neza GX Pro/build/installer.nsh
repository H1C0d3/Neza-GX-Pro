!macro customInstall
  ; Cerrar cualquier instancia en ejecución de Neza GX Pro
  ${if} ${isUpdated}
    DetailPrint "Cerrando Neza GX Pro..."
    nsExec::Exec 'taskkill /f /im "Neza GX Pro.exe"'
    Sleep 2000
  ${endif}
!macroend

!macro customUnInstall
  ; Cerrar aplicación antes de desinstalar
  DetailPrint "Cerrando Neza GX Pro..."
  nsExec::Exec 'taskkill /f /im "Neza GX Pro.exe"'
  Sleep 1000
!macroend

!macro customHeader
  !system "echo '' > ${BUILD_RESOURCES_DIR}\_customHeader"
!macroend
