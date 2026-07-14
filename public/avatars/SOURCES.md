# Avatar Sources

Os 24 avatares são recortes de um único asset comprado no Adobe Stock:

- **Arquivo de origem**: `AdobeStock_420429519.jpeg` (grid 16×6 = 96 retratos, "Portraits and avatars of people")
- **Licença**: comercial, confirmada pelo dono do projeto em 2026-07-14 (cobre recorte e uso
  como avatares de perfil dentro do Granativa). Arquivo de origem não fica no repo — só os
  recortes finais.
- **Como foi recortado**: grid detectado por análise de pixel (16 colunas × 6 linhas,
  ~390px de passo, medido pela fração de pixels não-brancos por coluna/linha em toda a
  largura/altura — evita que cabelo/barba de um avatar específico distorça a medição). Cada
  avatar recortado num quadrado de 292px centrado no círculo (folga mínima sobre o círculo de
  ~282px de diâmetro, só o suficiente pra evitar halo de compressão JPEG na borda — recortar
  com folga maior deixa um anel branco visível quando a UI aplica `border-radius: 50%`),
  redimensionado para 256×256 e exportado em JPEG q92.
- **Rótulos**: nomes próprios (não adjetivos de personalidade) — troca pedida pelo dono depois
  da primeira versão ("Esperto", "Confiante" etc. não estava bom).

| File | Rótulo | Posição no grid original (linha/coluna, 0-indexado) |
|---|---|---|
| ana.jpg | Ana | r0c1 |
| beatriz.jpg | Beatriz | r0c4 |
| carla.jpg | Carla | r0c6 |
| duda.jpg | Duda | r0c8 |
| elisa.jpg | Elisa | r0c12 |
| fernanda.jpg | Fernanda | r0c14 |
| gabriela.jpg | Gabriela | r1c4 |
| helena.jpg | Helena | r2c0 |
| iris.jpg | Íris | r2c5 |
| julia.jpg | Julia | r2c10 |
| larissa.jpg | Larissa | r3c11 |
| manuela.jpg | Manuela | r4c9 |
| bruno.jpg | Bruno | r0c0 |
| caio.jpg | Caio | r0c3 |
| diego.jpg | Diego | r0c10 |
| enzo.jpg | Enzo | r0c13 |
| felipe.jpg | Felipe | r1c1 |
| gustavo.jpg | Gustavo | r1c9 |
| hugo.jpg | Hugo | r1c12 |
| igor.jpg | Igor | r2c7 |
| joaquim.jpg | Joaquim | r3c2 |
| lucas.jpg | Lucas | r3c5 |
| rafael.jpg | Rafael | r5c12 |
| theo.jpg | Theo | r2c13 |
