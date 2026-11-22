// Português — o idioma padrão do jogo, e também o fallback de qualquer chave
// que ainda não exista em outro idioma.
//
// As frases do memorial descritivo são modelos com marcadores, não fragmentos
// concatenados: só assim a versão em inglês sai idiomática em vez de virar
// português traduzido palavra por palavra.

export default {
  // ------------------------------------------------------------- geral ----
  'app.title': 'Surveyor Valley',
  'app.subtitle': 'Simulador de levantamento planimétrico',

  'boot.failTitle': 'Não foi possível carregar o jogo',
  'boot.failBody':
    'O motor gráfico é baixado da internet na primeira vez que você abre o jogo. Conecte-se uma vez e ele passa a funcionar offline.',
  'boot.retry': 'Tentar de novo',
  'common.cancel': 'Cancelar',
  'common.confirm': 'Confirmar',
  'common.close': 'Fechar',
  'common.back': 'Voltar',
  'common.continue': 'Continuar',
  'common.yes': 'Sim',
  'common.no': 'Não',
  'common.metres': 'm',
  'common.hectares': 'ha',
  'common.none': '—',
  'common.loading': 'Carregando…',

  // --------------------------------------------------------- modal inicial -
  'intro.title': 'Bem-vindo ao Surveyor Valley',
  'intro.tagline':
    'Você é um topógrafo em um vale rural. Seis propriedades rurais precisam de levantamento planimétrico — e os proprietários estão esperando.',
  'intro.controlsTitle': 'Controles',
  'intro.stickKeys': 'Alavanca (canto inferior esquerdo)',
  'intro.stickDesc': 'Andar pelo terreno; empurre até o fim para correr',
  'intro.tapKeys': 'Toque',
  'intro.tapDesc': 'Agir com a ferramenta ativa no ponto tocado: visar um alvo, ou mandar o Ligeirinho implantar um marco ali',
  'intro.pinchKeys': 'Pinça',
  'intro.pinchDesc': 'Aproximar e afastar',
  'intro.twoFingerKeys': 'Dois dedos',
  'intro.twoFingerDesc': 'Arrastar para olhar em volta',
  'intro.doubleTapKeys': 'Toque duplo num marco',
  'intro.doubleTapDesc': 'Deslocamento rápido (o tempo do serviço é debitado no ritmo real da caminhada)',
  'intro.moveKeys': 'W A S D ou setas',
  'intro.moveDesc': 'Andar pelo terreno',
  'intro.runKeys': 'Shift',
  'intro.runDesc': 'Correr',
  'intro.mouseKeys': 'Mouse',
  'intro.mouseDesc': 'Apontar e clicar alvos; com a ferramenta de marco, clicar longe manda o Ligeirinho implantar lá; roda do mouse aproxima e afasta',
  'intro.rightDragKeys': 'Botão direito',
  'intro.rightDragDesc': 'Arrastar para olhar em volta',
  'intro.toolKeys': '1 – 7',
  'intro.toolDesc': 'Selecionar ferramenta na barra lateral',
  'intro.spaceKeys': 'Espaço',
  'intro.spaceDesc': 'Agir com a ferramenta ativa, onde você está: implantar o marco aos seus pés, instalar a estação sobre o marco que você ocupa, ou visar o alvo sob o cursor',
  'intro.batchKeys': 'B',
  'intro.batchDesc': 'Visar de uma vez todos os alvos visíveis da instalação atual — só no modo fácil, e liberado após quatro visadas manuais',
  'intro.dblClickKeys': 'Duplo clique num marco',
  'intro.dblClickDesc': 'Deslocamento rápido (o tempo do serviço é debitado no ritmo real da caminhada)',
  'intro.escKeys': 'Esc',
  'intro.escDesc': 'Voltar ao modo de caminhada',
  // ------------------------------------------------------------ Ligeirinho -
  'ligeirinho.title': 'Sua equipe',
  'ligeirinho.lead': 'Esse é o Ligeirinho, seu Auxiliar de Topografia!',
  'ligeirinho.body':
    'Levantamento com estação total é serviço de dois. Você fica na luneta; ele leva o prisma até o ponto — e leva correndo. Clique num alvo e veja. Ele também implanta marcos: clique longe de você e ele vai lá cravar.',
  'ligeirinho.hint':
    'Por isso a leitura só sai com você na estação: quem anda até o vértice é o Ligeirinho, não você.',
  'ligeirinho.ok': 'Bora trabalhar',

  'intro.characterTitle': 'Seu topógrafo',
  'intro.nameTitle': 'Nome',
  'intro.nameRoll': 'Sortear',
  'intro.nameRollHelp': 'Sortear outro nome. Ele assina a planta e o memorial descritivo.',
  'intro.bodyTitle': 'Corpo',
  'intro.skinTitle': 'Tom de pele',
  'intro.hairTitle': 'Cabelo',
  'intro.hatTitle': 'Chapéu',
  'look.body.m': 'Homem',
  'look.body.f': 'Mulher',
  'look.skin.clara': 'Clara',
  'look.skin.morena-clara': 'Morena clara',
  'look.skin.morena': 'Morena',
  'look.skin.parda': 'Parda',
  'look.skin.negra': 'Negra',
  'look.hair.castanho': 'Castanho',
  'look.hair.preto': 'Preto',
  'look.hair.louro': 'Louro',
  'look.hair.ruivo': 'Ruivo',
  'look.hair.grisalho': 'Grisalho',
  'look.hat.abaLarga': 'Chapéu de aba larga',
  'look.hat.palha': 'Chapéu de palha',
  'look.hat.bone': 'Boné',
  'look.hat.sol': 'Chapéu de sol',

  'intro.languageTitle': 'Idioma / Language',
  'intro.difficultyTitle': 'Dificuldade',
  'intro.seedTitle': 'Semente do mundo',
  'intro.seedHelp': 'A mesma semente gera exatamente o mesmo vale. Troque com os colegas.',
  'intro.seedRandom': 'Sortear',
  'intro.start': 'Começar o serviço',
  'intro.step': 'Passo {n} de {total}',
  'intro.next': 'Avançar',
  'intro.back': 'Voltar',
  'intro.objectiveTitle': 'Seu primeiro serviço',
  'intro.objective':
    'Implante ao menos dois marcos, instale a estação total sobre um deles orientando pelo outro, e levante todos os vértices da propriedade. Ao final você entrega a planta e o memorial descritivo.',
  'intro.disclaimer': 'Simulação didática. Os documentos gerados não têm valor legal.',
  'intro.author': 'criado pelo Professor Kaue de Moraes Vestena (UTFPR-BR), 2026',

  'difficulty.facil': 'Fácil',
  'difficulty.facilDesc': 'Poucos obstáculos, sem limite de tempo',
  'difficulty.medio': 'Médio',
  'difficulty.medioDesc': 'Mais obstáculos, sem limite de tempo',
  'difficulty.dificil': 'Difícil',
  'difficulty.dificilDesc': 'Muitos obstáculos, vértices encobertos e limite de tempo',

  // ---------------------------------------------------------------- HUD ----
  'hud.property': 'Propriedade',
  'hud.owner': 'Proprietário',
  'hud.elapsed': 'Tempo',
  'hud.station': 'Estação',
  'hud.noStation': 'sem instalação',
  'hud.money': 'Saldo',
  'hud.marcos': 'Marcos',
  'hud.progress': 'Vértices levantados',
  'hud.instrument': 'Instrumento',
  'hud.checklist': 'Roteiro',
  'hud.area': 'Área',
  'hud.zoom': 'Escala',

  // ------------------------------------------------------------- barra -----
  'tool.walk': 'Caminhar',
  'tool.marco': 'Implantar marco',
  'tool.estacao': 'Instalar estação',
  'tool.visada': 'Visar alvo',
  'tool.caderneta': 'Caderneta',
  'tool.calculos': 'Cálculos',
  'tool.mapa': 'Mapa geral',
  'tool.entrega': 'Entregar serviço',
  'tool.spaceHint': 'Espaço para agir',

  'tip.noService': 'Nenhum serviço em andamento.',
  'tip.noMarcosLeft': 'Você não tem mais marcos no estoque.',
  'tip.needTwoMarcos': 'Implante ao menos dois marcos antes de instalar o equipamento — a orientação precisa de dois pontos.',
  'tip.needStation': 'Instale a estação total antes de visar.',
  'tip.notAtInstrument': 'Volte para a estação total: a leitura é feita da luneta. Quem leva o prisma é o Ligeirinho.',
  'tip.noObservations': 'Nenhuma observação registrada ainda.',
  'tip.needThreeSetups': 'A poligonal precisa de pelo menos três estações ocupadas.',
  'tip.parcelIncomplete': 'Ainda faltam vértices da propriedade por levantar.',
  'tip.unknownTool': 'Ferramenta desconhecida.',
  'tip.pickATool': 'Escolha uma ferramenta primeiro: 2 marco, 3 estação, 4 visada. Espaço age com a ferramenta ativa.',
  'tip.cornerBuried': 'O marco do vértice {label} está encoberto pelo mato — vá até lá (a {dist} m) para encontrá-lo; basta chegar a {reach} m.',
  'tip.noTarget': 'Nenhum alvo sob o cursor — aponte o mouse para um vértice, poste ou marco.',

  // ------------------------------------------------------------- marcos ----
  'marco.placedByAux': 'Marco {id} implantado pelo Ligeirinho.',
  'marco.auxSent': 'Ligeirinho foi implantar o marco.',
  'marco.auxCouldNotReach': 'O Ligeirinho não conseguiu chegar até lá — o caminho está bloqueado.',
  'marco.placed': 'Marco {id} implantado.',
  'marco.badGround': 'Terreno inadequado para implantar um marco aqui.',
  'marco.tooCloseToMarco': 'Muito perto de outro marco — mantenha ao menos 1 m de distância.',
  'marco.noMarcosLeft': 'Estoque de marcos esgotado.',
  'marco.hint': 'Espaço implanta um marco aos seus pés; clique num ponto de solo firme mais longe e o Ligeirinho vai implantá-lo lá.',

  // ------------------------------------------------------------- tripé -----
  'tripod.ok': 'Terreno adequado para o tripé.',
  'tripod.marginal': 'Terreno aceitável, mas irregular.',
  'tripod.badSoil': 'Solo inadequado ({soil}) — as pernas do tripé não fixam.',
  'tripod.obstacle': 'Obstáculo dentro do raio de 1 m ({obj}).',
  'tripod.outOfBounds': 'Fora dos limites do vale.',
  'tripod.tooFarFromMarco': 'Aproxime-se do marco (menos de 1 m) para instalar sobre ele.',

  // ----------------------------------------------------------- instalação --
  'station.title': 'Instalar a estação total',
  'station.over': 'Instalar sobre',
  'station.backsight': 'Orientar visando (ré)',
  'station.orientMode': 'Modo de orientação',
  'station.zeroBacksight': 'Zerar na ré',
  'station.zeroBacksightHelp': 'A leitura na ré é forçada a 0°00\'00". O azimute sai da constante de orientação.',
  'station.datumTitle': 'Este é o primeiro serviço: nasce aqui o sistema de coordenadas',
  'station.datumHelp': 'Origem local arbitrária neste marco; o Norte é o Norte do mapa, e todos os azimutes são medidos a partir dele.',
  'station.origin': 'Coordenadas de partida',
  'station.installed': 'Estação instalada sobre {id}, orientada em {backsight}.',
  'station.theta0': 'Constante de orientação θ₀',
  'station.freeStation': 'Estação livre',
  'station.freeOnlyHere': 'Não há marco ao seu alcance aqui — mas dá para fixar a estação por interseção.',
  'station.visibleKnown': 'Pontos de coordenadas conhecidas visíveis daqui: {n} (mínimo 2).',
  'station.noMarcoNoFix': 'Aproxime-se de um marco para instalar sobre ele, ou vá até um ponto de onde enxergue ao menos dois pontos conhecidos.',
  'station.freeStationHelp': 'Instale onde quiser e vise dois ou mais pontos conhecidos.',
  'station.needTwoKnownPoints': 'A estação livre exige ao menos dois pontos de coordenadas conhecidas.',
  'station.notEnoughVisible': 'Não há pontos conhecidos suficientes visíveis daqui.',
  'station.stationNotCoordinated': 'O marco escolhido ainda não tem coordenadas — vise-o a partir de outra estação.',
  'station.backsightNotCoordinated': 'A ré escolhida ainda não tem coordenadas.',
  'station.tooFarFromMarco': 'Aproxime-se do marco para instalar sobre ele.',
  'station.unknownBacksight': 'Ré desconhecida.',
  'station.backsightIsStation': 'A ré precisa ser um ponto diferente da estação.',
  'station.resectionResult': 'Estação livre resolvida: EMQ {rms} m, escala {ppm} ppm.',
  'station.scaleSuspect': 'A escala recuperada está muito longe de 1 — verifique se alguma distância foi anotada errada.',

  // -------------------------------------------------------------- visada ---
  'sight.blocked': 'Linha de visada obstruída por: {obj}',
  'sight.recorded': '{label}: {dist} m, Hz {hz}',

  // The live instrument face, lower right.
  'readout.title': 'VISADA',
  'readout.re': 'RÉ',
  'readout.backsight': 'Ré',
  'readout.target': 'Alvo',
  'readout.hz': 'Leitura Hz',
  'readout.fromBacksight': 'Ângulo da ré',
  'readout.azimuth': 'Azimute',
  'readout.distance': 'Distância',
  'readout.blocked': 'Visada obstruída',
  'sight.noStation': 'Nenhuma estação instalada.',
  'sight.hint': 'Clique num alvo visível para medir ângulo e distância.',
  'sight.notAtInstrument': 'Você precisa estar na estação total para fazer a leitura.',
  'sight.leftInstrument': 'Você saiu da estação — visada cancelada.',
  'sight.unknownTarget': 'Alvo desconhecido.',
  'sight.measureAll': 'Medir todos os visíveis',
  'sight.measureAllLocked': 'Faça algumas visadas manuais antes de liberar a medição em lote.',
  'sight.measureAllFacilOnly': 'A medição em lote só existe no modo fácil.',
  'sight.measureAllDone': '{n} alvos medidos, {blocked} obstruídos.',

  'obstacle.arvore': 'árvore',
  'obstacle.arbusto': 'arbusto',
  'obstacle.rocha': 'rocha',
  'obstacle.cerca': 'cerca',
  'obstacle.poste': 'poste',
  'obstacle.benfeitoria': 'benfeitoria',
  'obstacle.marco_divisa': 'marco de divisa',
  'obstacle.marco_jogador': 'marco',

  'soil.PASTO': 'pasto',
  'soil.CAMPO_SUJO': 'campo sujo',
  'soil.SOLO_EXPOSTO': 'solo exposto',
  'soil.LAVOURA': 'lavoura',
  'soil.AREIA': 'areia solta',
  'soil.ROCHA': 'afloramento rochoso',
  'soil.BREJO': 'brejo',
  'soil.AGUA': 'água',

  // ---------------------------------------------------------- caderneta ----
  'caderneta.title': 'Caderneta de campo',
  'caderneta.setup': 'Estação {id}',
  'caderneta.over': 'sobre {id}',
  'caderneta.backsight': 'ré {id}',
  'caderneta.colTarget': 'Ponto visado',
  'caderneta.colHz': 'Leitura Hz',
  'caderneta.colDist': 'Distância (m)',
  'caderneta.colAz': 'Azimute',
  'caderneta.colRumo': 'Rumo',
  'caderneta.colDE': 'ΔE (m)',
  'caderneta.colDN': 'ΔN (m)',
  'caderneta.colE': 'E (m)',
  'caderneta.colN': 'N (m)',
  'caderneta.formula': 'Az = Hz + θ₀   ·   E = E₀ + d·sen(Az)   ·   N = N₀ + d·cos(Az)',
  'caderneta.export': 'Exportar CSV',
  'caderneta.exported': 'Caderneta exportada ({n} linhas).',
  'caderneta.csvSetup': 'Instalação',
  'caderneta.csvOver': 'Sobre',
  'caderneta.csvBacksight': 'Ré',
  'caderneta.csvAdjusted': 'compensado (m)',
  'caderneta.empty': 'Nenhuma observação registrada.',
  'caderneta.freeStation': 'estação livre',

  // ----------------------------------------------------------- cálculos ----
  'calc.title': 'Cálculos da poligonal',
  'calc.subtitle': 'Poligonal fechada, compensação por método clássico',
  'calc.reradiation': 'Irradiação a partir da poligonal compensada',
  'calc.reradiationBody': 'As coordenadas compensadas das estações foram usadas para reduzir de novo {points} observações de {setups} instalações. É isso que leva a compensação até os vértices, a área, a planta e o memorial.',
  'calc.reradiationSkipped': 'Não compensadas (fora da poligonal): {list}. Essas observações mantêm a redução original — nada as ajustou.',
  'calc.freeStationShort': 'estação livre',
  'calc.notRigorous':
    'Este é o tratamento de Topografia 1: erro de fechamento e compensação proporcional. O ajustamento rigoroso por mínimos quadrados é assunto de Ajustamento de Observações.',
  'calc.angularClosure': 'Erro de fechamento angular',
  'calc.angularSum': 'Σ ângulos observados',
  'calc.angularTheoretical': 'Σ teórico',
  'calc.angularTolerance': 'Tolerância',
  'calc.angularCorrection': 'Correção por vértice',
  'calc.interior': 'ângulos internos, (n−2)·180°',
  'calc.exterior': 'ângulos externos, (n+2)·180°',
  'calc.linearClosure': 'Erro de fechamento linear',
  'calc.eE': 'Erro em E',
  'calc.eN': 'Erro em N',
  'calc.eLin': 'Erro linear',
  'calc.perimeter': 'Perímetro',
  'calc.relPrecision': 'Precisão relativa',
  'calc.required': 'Exigido nesta dificuldade',
  'calc.rule': 'Regra de compensação',
  'calc.bowditch': 'Bowditch (bússola)',
  'calc.transit': 'Transit',
  'calc.pass': 'dentro da tolerância',
  'calc.fail': 'fora da tolerância',
  'calc.colStation': 'Estação',
  'calc.colAngleObs': 'Ângulo observado',
  'calc.colAngleAdj': 'Ângulo compensado',
  'calc.colAzimuth': 'Azimute',
  'calc.colDistance': 'Distância',
  'calc.colCorrE': 'δE',
  'calc.colCorrN': 'δN',
  'calc.needThreeStations': 'Ocupe ao menos três marcos para fechar uma poligonal (você ocupou {have}).',
  'calc.incompleteAngles':
    'Ainda não há ângulos suficientes. O ângulo de uma estação é a diferença entre duas leituras da MESMA instalação: em cada marco ocupado, vise outros dois marcos, de modo que os marcos formem um anel fechado. Se a visada estiver obstruída, mude o marco de lugar — estações vizinhas precisam enxergar umas às outras.',
  'calc.incompleteDistances': 'Faltam distâncias entre estações consecutivas.',
  'calc.noStartCoordinates': 'A primeira estação ainda não tem coordenadas.',
  'calc.area': 'Área da propriedade',
  'calc.areaFormula': 'Área por Gauss (fórmula dos determinantes)',

  // ------------------------------------------------------------ entrega ----
  'delivery.title': 'Entrega do serviço',
  'delivery.planta': 'Planta',
  'delivery.memorial': 'Memorial descritivo',
  'delivery.debrief': 'Conferência',
  'delivery.exportPdf': 'Exportar PDF',
  'delivery.print': 'Imprimir',
  'debrief.perCorner': 'Erro por vértice',
  'debrief.perCornerHelp': 'Distância entre a coordenada levantada e a verdadeira, depois de remover a origem arbitrária do datum — o que sobra é só o erro que você cometeu. EMQ dos vértices {rms}; da rede de apoio {control}.',
  'debrief.corner': 'Vértice',
  'debrief.offBy': 'Erro',
  'debrief.sights': 'Visadas',
  'debrief.figureTitle': 'Carta de erros',
  'debrief.figureLegend': 'Vetores de erro ampliados {factor}× · figura em 1:{scale}',
  'debrief.figureNote': 'Documento de avaliação, não faz parte da entrega. As setas apontam da posição verdadeira para a levantada.',
  'delivery.areaSurveyed': 'Área levantada',
  'delivery.areaTrue': 'Área real',
  'delivery.areaError': 'Diferença',
  'delivery.perimeterError': 'Erro no perímetro',
  'delivery.sideRms': 'EMQ dos lados',
  'delivery.elapsed': 'Tempo total',
  'delivery.payment': 'Pagamento',
  'delivery.quality': 'Qualidade do serviço',
  'delivery.incomplete': 'Ainda faltam {n} vértices por levantar.',
  'delivery.toSede': 'Levar à sede',
  'delivery.goToSede': 'Documentos prontos. Leve-os até a sede da {property} — {owner} espera na porta para acertar o pagamento.',
  'delivery.congratulations': 'Serviço concluído. {owner} agradece.',
  'delivery.pdfFailed': 'Não foi possível carregar o gerador de PDF. Use a impressão do navegador (Salvar como PDF).',

  // ------------------------------------------------------------- planta ----
  'planta.title': 'PLANTA PLANIMÉTRICA',
  'planta.property': 'Imóvel',
  'planta.owner': 'Proprietário',
  'planta.municipio': 'Município/UF',
  'planta.area': 'Área',
  'planta.perimeter': 'Perímetro',
  'planta.scale': 'Escala',
  'planta.date': 'Data',
  'planta.responsible': 'Responsável técnico',
  'planta.seed': 'Semente',
  'planta.north': 'Norte',
  'planta.legend': 'Legenda',
  'planta.legendVertex': 'Vértice levantado',
  'planta.legendStation': 'Estação ocupada',
  'planta.legendBoundary': 'Divisa',
  'planta.tableVertices': 'Quadro de coordenadas',
  'planta.tableSides': 'Quadro de lados',
  'planta.colPoint': 'Ponto',
  'planta.colE': 'E (m)',
  'planta.colN': 'N (m)',
  'planta.colSide': 'Lado',
  'planta.colAz': 'Azimute',
  'planta.colRumo': 'Rumo',
  'planta.colDist': 'Distância (m)',
  'planta.colConfrontante': 'Confrontante',
  'planta.disclaimer': 'SIMULAÇÃO DIDÁTICA — SEM VALOR LEGAL',

  // ----------------------------------------------------------- memorial ----
  'memorial.title': 'MEMORIAL DESCRITIVO',
  'memorial.property': 'Imóvel',
  'memorial.owner': 'Proprietário',
  'memorial.municipio': 'Município/UF',
  'memorial.matricula': 'Matrícula',
  'memorial.matriculaValue': '{n} (fictícia)',
  'memorial.area': 'Área',
  'memorial.perimeter': 'Perímetro',
  'memorial.referenceSystem': 'Sistema de referência',
  'memorial.referenceSystemValue':
    'sistema topográfico local, origem arbitrária no vértice {vertex}, azimutes referidos ao Norte da carta.',
  'memorial.perimeterTitle': 'DESCRIÇÃO DO PERÍMETRO',
  'memorial.opening':
    'Inicia-se a descrição deste perímetro no vértice {vertex}, de coordenadas E {e} m e N {n} m;',
  'memorial.segment':
    'deste, segue com azimute de {az} e rumo {rumo}, por uma distância de {dist} m, confrontando neste trecho com {confrontante}, até o vértice {toVertex}, de coordenadas E {e} m e N {n} m;',
  'memorial.closing':
    'deste, segue com azimute de {az} e rumo {rumo}, por uma distância de {dist} m, confrontando neste trecho com {confrontante}, até o vértice {toVertex}, ponto inicial da presente descrição, encerrando o perímetro descrito.',
  'memorial.method':
    'Todos os azimutes e distâncias foram obtidos por levantamento planimétrico executado com {instrument}.',
  'memorial.methodTraverse':
    'Todos os azimutes e distâncias foram obtidos por levantamento planimétrico executado com {instrument}, poligonal fechada compensada pelo método de {rule}, com erro de fechamento angular de {eAng} e precisão linear relativa de {relPrecision}.',
  'memorial.signature': '{municipio}, {date}.',
  'memorial.responsible': 'Responsável técnico',
  'memorial.disclaimer':
    'SIMULAÇÃO DIDÁTICA — SEM VALOR LEGAL. Documento gerado pelo jogo Surveyor Valley para fins de ensino.',

  // -------------------------------------------------------------- mapa -----
  'map.title': 'Mapa do vale',
  'map.subtitle': 'Seis propriedades. Escolha onde trabalhar.',
  'map.selectParcel': 'Trabalhar nesta propriedade',
  'map.status.available': 'Disponível',
  'map.status.active': 'Em andamento',
  'map.status.done': 'Concluída',
  'map.reusable': '{n} pontos de apoio reaproveitáveis por perto',

  // ---------------------------------------------------------- tutorial -----
  'tutorial.title': 'Roteiro do serviço',
  'tutorial.placeFirstMarco': 'Implante o primeiro marco em solo firme',
  'tutorial.placeSecondMarco': 'Implante um segundo marco — a orientação precisa de dois pontos',
  'tutorial.setUpStation': 'Instale a estação total sobre um marco, orientando pelo outro',
  'tutorial.takeSights': 'Vise os vértices da propriedade',
  'tutorial.walkTheLoop': 'Ocupe os demais marcos e levante todos os vértices',
  'tutorial.compute': 'Calcule a poligonal e confira o fechamento',
  'tutorial.deliver': 'Entregue a planta e o memorial descritivo',

  // ------------------------------------------------------------ avisos -----
  'notify.markFound': 'Vértice {label} encontrado no mato — agora dá para visá-lo.',
  'notify.saved': 'Progresso salvo.',
  'notify.saveCorrupt': 'O jogo salvo estava corrompido e foi arquivado. Começando de novo.',
  'notify.travelled': 'Deslocamento rápido: {dist} m, {time} de caminhada debitados.',
  'notify.travelNoRoom': 'Não há espaço para chegar até esse marco.',
  'notify.timeUp': 'O tempo acabou! O proprietário desistiu do serviço.',

  'memorial.ruleBowditch': 'Bowditch',
  'memorial.ruleTransit': 'Transit',

  'eq.et10': 'Estação total 10" · 10 mm + 10 ppm',
  'eq.et5': 'Estação total 5" · 5 mm + 5 ppm',
  'eq.et3': 'Estação total 3" · 3 mm + 2 ppm',
  'eq.et1': 'Estação total 1" · 2 mm + 2 ppm',
  'eq.tri-mad': 'Tripé de madeira',
  'eq.tri-fib': 'Tripé de fibra de vidro',
  'eq.bastao': 'Bastão com mira',
  'eq.prisma-tri': 'Prisma sobre tripé',

  // ---- job board -----------------------------------------------------------
  'picker.title': 'Serviços disponíveis',
  'picker.intro': '{done} de {total} propriedades levantadas. Escolha a próxima.',
  'picker.property': 'Propriedade',
  'picker.area': 'Área',
  'picker.vertices': 'Vértices',
  'picker.pays': 'Paga',
  'picker.take': 'Aceitar o serviço',
  'picker.reusable': '{n} marco(s) seu(s) já implantado(s) por perto — dá para reaproveitar',
  'picker.completed': 'Concluída em {time} · R$ {paid}',
  'picker.switchCost': 'Trocar de serviço agora custa R$ {amount}',
  'picker.switchPenaltyApplied': 'Serviço em andamento abandonado — custo de troca R$ {amount}',
  'picker.nearest': 'Mais perto',
  'picker.mostReady': 'Mais adiantada',

  'campaign.title': 'Fim da temporada',
  'campaign.body':
    'As seis propriedades do vale foram levantadas. Cada planta e cada memorial saiu do seu caderno de campo.',
  'campaign.totalTime': 'Tempo total',
  'campaign.totalEarned': 'Total recebido',
  'campaign.kit': 'Equipamento final',
  'campaign.restart': 'Começar um novo vale',

  // ---- shop ----------------------------------------------------------------
  'shop.title': 'Loja de equipamentos',
  'shop.intro':
    'Instrumento melhor significa fechamento mais apertado — e serviço mais bem pago. A tolerância ao lado de cada um é a que o painel de cálculos vai cobrar.',
  'shop.instruments': 'Estações totais',
  'shop.tripods': 'Tripés',
  'shop.targets': 'Alvos',
  'shop.marcos': 'Marcos',
  'shop.marcoPack': 'Pacote com {n} marcos',
  'shop.marcoHave': 'Você tem {n} na caminhonete',
  'shop.owned': 'Em uso',
  'shop.tolerance': 'tolerância angular ±{sec}" numa poligonal de 5 estações',
  'shop.centring': 'erro de centragem σ = {mm} mm',
  'shop.open': 'Loja',

  // ---- payment breakdown ---------------------------------------------------
  'pay.title': 'Pagamento do serviço',
  'pay.ownerLine': '“Serviço bem-feito! Aqui está o combinado, como a gente ajustou.” — {owner}',
  'pay.callout': 'Deslocamento',
  'pay.area': 'Área levantada ({ha} ha)',
  'pay.difficulty': 'Ajuste de dificuldade ({mult})',
  'pay.quality': 'Qualidade do fechamento ({mult})',
  'pay.time': 'Tempo de execução ({mult})',
  'pay.materials': 'Marcos consumidos ({n})',
  'pay.total': 'Total recebido',
  'pay.next': 'Próximo serviço',
  'pay.shop': 'Ir à loja',

  'intro.resumeTitle': 'Continuar de onde parou',
  'intro.resumeSummary': '{done} de 6 propriedades levantadas · saldo de R$ {money}',
  'intro.resumeWarning': 'Começar um jogo novo apaga este progresso.',
  'intro.resume': 'Continuar',
  'intro.startNew': 'Jogo novo',
  'save.restoreFailed': 'Não foi possível retomar o jogo salvo. Começando um novo.',
  'save.writeFailed': 'Não foi possível salvar seu progresso neste dispositivo (armazenamento cheio ou desativado). Continue jogando, mas esta sessão pode não estar aqui da próxima vez.',

  'hud.sound': 'Som',
  'hud.music': 'Música',

  'settings.twoFace': 'PD/PI',
  'settings.twoFaceHelp':
    'Observar nas duas posições da luneta. A média das duas cancela o erro de colimação, que é sistemático e nunca some na média de várias leituras numa posição só.',
  'settings.dms': 'GMS',
  'settings.gon': 'gon',
  'settings.gonHelp': 'Alternar entre graus/minutos/segundos e grados (400 gon = 360°).',
  'caderneta.colHzPD': 'Hz PD',
  'caderneta.colHzPI': 'Hz PI',
  'caderneta.twoCHelp': '2c = PD − (PI − 180°). É o dobro do erro de colimação do instrumento.',
  'pay.overtime': 'Hora extra ({minutes} min, {mult})',

  // ---- Bastidores do erro: o painel escondido (digite "erro", ou o σ discreto) ----
  'theory.title': 'Bastidores do erro',
  'theory.open': 'Bastidores do erro: como o erro se propaga',
  'theory.lead':
    'De onde vem cada erro deste jogo, como ele viaja até a área e quais fórmulas fazem a conta. É a teoria de Topografia 1, com os números exatos que o jogo usa.',

  'theory.path.title': '1 · O caminho do erro neste jogo',
  'theory.path.p1':
    'Cada marco tem duas posições: a verdadeira, onde ele está fisicamente no vale, e a levantada, que é o que você mediu. Você só vê a levantada. O erro não é sorteado no fim: ele nasce em cada leitura e viaja pelas mesmas contas que você faria à mão.',
  'theory.path.o1':
    'Instalação. Ao ocupar um marco, sorteia-se a centragem do tripé (em E e em N, uma vez por ocupação) e a leitura da ré carrega erro de pontaria e a centragem do alvo na ré. Daí sai a constante de orientação θ₀, calculada com as coordenadas que você ACREDITA ter para a estação e para a ré.',
  'theory.path.o2':
    'Visada. Para cada ponto sorteiam-se a centragem do bastão ou prisma, o erro de direção (precisão do instrumento + pontaria) e o erro de distância (a mm + b ppm). A colimação c entra igual em toda leitura em PD. A leitura é gerada a partir da geometria VERDADEIRA.',
  'theory.path.o3':
    'Redução. Az = Hz + θ₀, E = E₀ + d·sen Az e N = N₀ + d·cos Az, sempre com as coordenadas levantadas da estação. Por isso o erro da estação e o de θ₀ passam inteiros para todo ponto irradiado dela.',
  'theory.path.o4':
    'Rede. Um marco medido ganha coordenadas irradiadas e pode virar a próxima estação, levando junto o seu erro. Numa cadeia de irradiações os erros se acumulam.',
  'theory.path.o5':
    'Poligonal. Os ângulos (diferença de duas leituras da mesma ocupação) e as distâncias entre estações dão o erro de fechamento angular e o linear. A compensação distribui o erro angular igualmente e o linear por Bowditch ou Transit, corrigindo as estações.',
  'theory.path.o6':
    'Re-irradiação. Com as estações compensadas, θ₀ é recalculado e todas as visadas são reduzidas de novo. Um vértice visado mais de uma vez fica com a média das reduções.',
  'theory.path.o7':
    'Entrega. O anel de vértices dá a área (Gauss) e o perímetro. Só no balanço final eles são comparados com a verdade, depois de retirar a translação arbitrária do datum.',
  'theory.path.n1':
    'Todo sorteio usa um gerador com semente: a mesma semente repete exatamente as mesmas medidas.',

  'theory.kinds.title': '2 · Tipos de erro',
  'theory.kinds.p1':
    'Grosseiros (enganos): um número trocado, o ponto errado. Não seguem estatística nenhuma e só se descobrem por verificação: fechamento, resíduos, a escala da estação livre.',
  'theory.kinds.p2':
    'Sistemáticos: mesmo sinal e mesmo valor nas mesmas condições. Neste jogo é a colimação c. Repetir não adianta; removem-se por procedimento (PD/PI) ou calibração.',
  'theory.kinds.p3':
    'Aleatórios (acidentais): pequenos, de sinal imprevisível, seguem a distribuição normal. Aqui são a centragem, a direção (pontaria) e a distância. Cada um é um único sorteio:',
  'theory.kinds.f1': 'x = x_verdadeiro + σ·z        z ~ N(0, 1)',
  'theory.kinds.p4':
    'O desvio-padrão σ mede a dispersão: cerca de 68 % dos erros caem dentro de ±1σ, 95 % dentro de ±2σ e 99,7 % dentro de ±3σ. Por isso as tolerâncias são escritas como 2σ ou 3σ.',
  'theory.kinds.n1':
    'Precisão (dispersão pequena) não é acurácia (proximidade da verdade): um erro sistemático deixa medições muito precisas e, mesmo assim, erradas.',

  'theory.law.title': '3 · A lei de propagação das variâncias',
  'theory.law.p1':
    'Se um resultado y é calculado a partir de medidas independentes, y = f(x₁, …, xₙ), o seu desvio-padrão é:',
  'theory.law.f1': 'σ_y² = (∂f/∂x₁)²·σ₁² + (∂f/∂x₂)²·σ₂² + … + (∂f/∂xₙ)²·σₙ²',
  'theory.law.p2':
    'Cada derivada parcial diz quanto y muda quando xᵢ muda um pouco: é o peso daquele erro no resultado. Casos que aparecem o tempo todo:',
  'theory.law.l1': 'Soma ou diferença, y = x₁ ± x₂: σ_y = √(σ₁² + σ₂²). Erros independentes somam em quadratura, nunca linearmente.',
  'theory.law.l2': 'Multiplicação por constante, y = k·x: σ_y = |k|·σ.',
  'theory.law.l3': 'Média de k medidas: σ_média = σ/√k. Quatro vezes mais leituras para metade do erro.',
  'theory.law.l4': 'Um ângulo é a diferença de duas direções: σ_β = √2·σ_dir.',
  'theory.law.p3':
    'Na forma matricial, com a matriz jacobiana J (as derivadas parciais) e a matriz variância-covariância Σ das medidas:',
  'theory.law.f2': 'Σ_yy = J · Σ_xx · Jᵀ',
  'theory.law.n1':
    'A lei é de primeira ordem (lineariza f perto do valor medido) e, na forma simples, supõe medidas independentes. Quando dois resultados dependem do mesmo erro aparecem covariâncias, e esse é o assunto de Ajustamento de Observações.',
  'theory.law.n2': 'Ângulos entram nas fórmulas em radianos. Para converter segundos: divida por ρ" = 206 265".',

  'theory.instrument.title': '4 · O modelo do instrumento',
  'theory.instrument.p1': 'Quatro fontes de erro, separadas de propósito. As três primeiras são aleatórias.',
  'theory.instrument.p2':
    'Direção: a precisão nominal da estação total (10", 5", 3" ou 1"), somada em quadratura a um erro de pontaria que cresce nas visadas curtas.',
  'theory.instrument.f1': 'σ_dir(d) = √(σ_ET² + σ_p²)        σ_p = mín(6"·2 m / máx(d, 2 m), 30")',
  'theory.instrument.p3': 'Distância: o clássico a mm + b ppm, também em quadratura.',
  'theory.instrument.f2': 'σ_d = √(a² + (b·10⁻⁶·d)²)',
  'theory.instrument.p4':
    'Centragem: o tripé fica fora do marco por um deslocamento sorteado em E e em N (σ_i, uma vez por ocupação); o bastão ou prisma, por outro (σ_t, a cada visada). Em coordenadas são σ milímetros a qualquer distância; vista como ângulo, a centragem é enorme nas visadas curtas.',
  'theory.instrument.f3': 'ε" = ρ"·σ_c / d        ex.: 2,5 mm a 20 m → 26"   ·   a 200 m → 2,6"',
  'theory.instrument.p5':
    'Colimação (sistemática): um desalinhamento fixo c da linha de visada. Em PD a leitura sai c a mais; em PI, com a luneta girada 180°, sai c a menos. A média das duas posições cancela c, e a diferença mostra quanto o instrumento está fora.',
  'theory.instrument.f4': 'PD = Hz + c        PI = Hz + 180° − c\nHz = (PD + (PI − 180°)) / 2        2c = PD − (PI − 180°)',
  'theory.instrument.n1':
    'PD/PI também tira a média de duas leituras, então o ruído de direção cai por √2. A centragem não melhora: o bastão está no mesmo lugar nas duas leituras.',
  'theory.instrument.n2':
    'Detalhe do modelo: neste jogo a leitura de orientação na ré não leva colimação, mas toda visada de vante leva +c. Numa só posição, então, os ângulos entre duas vantes da mesma estação (os da poligonal) cancelam c, enquanto todo azimute irradiado gira c, deslocando o vértice d·c/ρ" para o lado (22" a 50 m ≈ 5 mm). Num instrumento real, com visadas quase horizontais, c também afeta a ré e quase se cancela; o efeito real é c/sen z, que cresce em visadas inclinadas.',

  'theory.radial.title': '5 · Irradiação: do ângulo à coordenada',
  'theory.radial.p1': 'Cada ponto é calculado a partir da estação e de duas medidas.',
  'theory.radial.f1': 'Az = Hz + θ₀        E = E₀ + d·sen Az        N = N₀ + d·cos Az',
  'theory.radial.p2': 'As derivadas parciais (Az em radianos) e a lei de propagação dão:',
  'theory.radial.f2': '∂E/∂d = sen Az     ∂E/∂Az = d·cos Az     ∂N/∂d = cos Az     ∂N/∂Az = −d·sen Az',
  'theory.radial.f3': 'σ_E² = σ_E₀² + sen²Az·σ_d² + d²·cos²Az·σ_Az²\nσ_N² = σ_N₀² + cos²Az·σ_d² + d²·sen²Az·σ_Az²',
  'theory.radial.p3':
    'Fica mais claro girando os eixos para a linha de visada: ao longo dela o erro é o do distanciômetro; atravessado, é a distância vezes o erro angular. A elipse de erro se alonga para o lado que for pior.',
  'theory.radial.f4': 'σ_L = σ_d        σ_T = d·σ_Az / ρ"        σ_P = √(σ_E₀² + σ_N₀² + σ_L² + σ_T²)',
  'theory.radial.p4':
    'O erro do azimute tem duas partes: a leitura do ponto e a orientação θ₀ = Az_ré − Hz_ré. A orientação vem de uma visada à ré, e o erro dela gira TODOS os pontos daquela estação.',
  'theory.radial.f5': 'σ_Az² = σ_dir(d)² + σ_θ₀²        σ_θ₀² ≈ σ_dir(d_ré)² + ρ"²·(σ_i² + σ_t²) / d_ré²',
  'theory.radial.p5':
    'É por isso que uma ré curta é tão ruim: a centragem vista a 10 m vira um erro angular grande, multiplicado depois pela distância de cada ponto. Um ponto a 100 m orientado numa ré a 10 m herda uns 10 vezes a centragem como erro lateral.',
  'theory.radial.n1':
    'Somando tudo, uma visada dá σ_P² ≈ 2σ_i² + 2σ_t² + σ_d² + (d·σ_dir/ρ")² + (d·σ_θ₀/ρ")², mais o erro da própria estação. As centragens contam duas vezes porque deslocam em E e em N.',

  'theory.repeat.title': '6 · Repetir visadas: o que a média resolve',
  'theory.repeat.p1':
    'Um vértice visado k vezes fica com a média das reduções, e a média só reduz o que é sorteado de novo a cada visada.',
  'theory.repeat.l1': 'Somem com a média (÷√k): ruído de direção, ruído de distância, centragem do bastão ou prisma.',
  'theory.repeat.l2':
    'Não somem, se as visadas vêm da mesma ocupação: centragem do tripé, erro da orientação θ₀, colimação numa posição só, erro das coordenadas da estação.',
  'theory.repeat.f1': 'σ_P(k)² ≈ σ_fixo² + σ_aleatório² / k',
  'theory.repeat.p2':
    'Para atacar a parte fixa é preciso mudar o procedimento: visar o ponto de outra estação, usar uma ré mais longa, comprar um tripé melhor, ou observar em PD/PI contra a colimação.',

  'theory.traverse.title': '7 · Poligonal fechada',
  'theory.traverse.p1':
    'O ângulo de uma estação é a diferença de duas leituras (ré e vante) da MESMA ocupação. Seu desvio-padrão tem as duas direções e as centragens:',
  'theory.traverse.f1': 'σ_β² = σ_dir(d₁)² + σ_dir(d₂)²\n     + (ρ"·σ_i·c / (d₁·d₂))²\n     + (ρ"·σ_t)²·(1/d₁² + 1/d₂²)',
  'theory.traverse.n1':
    'd₁ e d₂ são as distâncias às estações vizinhas e c é a distância entre elas. O termo do tripé some quando as duas vizinhas estão na mesma direção e é máximo quando estão opostas.',
  'theory.traverse.p2':
    'Fechamento angular: a soma teórica é (n − 2)·180° para ângulos internos e (n + 2)·180° para externos.',
  'theory.traverse.f2': 'e_α = Σβ − (n ∓ 2)·180°        T = 2·√2·σ_ET·√n        correção por estação = −e_α / n',
  'theory.traverse.n2':
    'A tolerância T do jogo usa só a precisão nominal do instrumento (σ_ET), sem centragem. Em lados curtos a centragem domina: veja em "Seus números agora" a tolerância prevista com ela.',
  'theory.traverse.p3':
    'Transporte de azimutes: cada azimute herda o anterior, então antes do fechamento o erro cresce como um passeio aleatório.',
  'theory.traverse.f3': 'Azᵢ = Azᵢ₋₁ + 180° + βᵢ  (mod 360°)        σ_Az,k ≈ σ_β·√k',
  'theory.traverse.p4': 'Fechamento linear e precisão relativa:',
  'theory.traverse.f4': 'e_E = ΣΔE     e_N = ΣΔN     e = √(e_E² + e_N²)     precisão = 1 : (ΣD / e)',
  'theory.traverse.p5':
    'O erro linear esperado, depois da distribuição igual do erro angular (rᵢ é a distância da estação i ao centroide das estações):',
  'theory.traverse.f5': 'E[e²] = Σ σ_dᵢ² + Σ (σ_βᵢ / ρ")²·rᵢ²',
  'theory.traverse.n3':
    'Por que o centroide: um erro de ângulo na estação i gira o resto da poligonal em torno de i. A distribuição igual subtrai o erro médio de todas as estações, e o que sobra equivale a girar em torno do centroide. Os testes do jogo conferem essa fórmula por simulação.',
  'theory.traverse.p6': 'Compensação linear: cada lado recebe uma parte do erro, com sinal contrário.',
  'theory.traverse.f6': 'Bowditch:  δEᵢ = −e_E·Dᵢ / ΣD          δNᵢ = −e_N·Dᵢ / ΣD\nTransit:   δEᵢ = −e_E·|ΔEᵢ| / Σ|ΔE|    δNᵢ = −e_N·|ΔNᵢ| / Σ|ΔN|',
  'theory.traverse.n4':
    'A precisão relativa piora em propriedades menores: a centragem e a constante do distanciômetro não diminuem com a figura, mas o perímetro sim.',
  'theory.traverse.n5':
    'Bowditch supõe ângulos e distâncias de precisão comparável; Transit, ângulos melhores que as distâncias. Nenhuma das duas é um ajustamento rigoroso.',

  'theory.free.title': '8 · Estação livre (mínimos quadrados)',
  'theory.free.p1':
    'Sem marco sob o instrumento, as visadas polares a pontos conhecidos já são coordenadas num sistema próprio, x = d·sen Hz e y = d·cos Hz. Ajusta-se uma transformação de similaridade (Helmert 2D):',
  'theory.free.f1': 'E = E_S + a·x + b·y        N = N_S − b·x + a·y        a = s·cos θ,  b = s·sen θ',
  'theory.free.p2': 'Centralizando as duas nuvens (′ = menos a média), a solução de mínimos quadrados sai em forma fechada:',
  'theory.free.f2': 'a = Σ(x′E′ + y′N′) / Σ(x′² + y′²)        b = Σ(y′E′ − x′N′) / Σ(x′² + y′²)\nE_S = Ē − a·x̄ − b·ȳ        N_S = N̄ + b·x̄ − a·ȳ',
  'theory.free.f3': 'v = ajustado − conhecido        rms = √(Σv² / (2n − 4))        escala = (s − 1)·10⁶ ppm',
  'theory.free.n1':
    'São 2n equações (E e N de cada ponto) para 4 incógnitas (E_S, N_S, θ, s): com 2 pontos a solução é exata; com 3 ou mais sobra redundância para estimar o erro. Uma escala longe de 1 quase sempre é uma distância anotada errada, e pontos todos no mesmo setor deixam a posição fraca na direção perpendicular.',

  'theory.area.title': '9 · Área',
  'theory.area.f1': 'A = ½·Σ (Eᵢ·Nᵢ₊₁ − Eᵢ₊₁·Nᵢ)',
  'theory.area.f2': '∂A/∂Eᵢ = ½·(Nᵢ₊₁ − Nᵢ₋₁)        ∂A/∂Nᵢ = ½·(Eᵢ₋₁ − Eᵢ₊₁)',
  'theory.area.f3': 'σ_A = ½·√( Σ σᵢ²·|Pᵢ₊₁ − Pᵢ₋₁|² )',
  'theory.area.p1':
    'Cada vértice pesa na proporção da diagonal entre os seus dois vizinhos. O mesmo erro num vértice de ponta estreita mexe pouco na área; num vértice que abre a figura, mexe muito.',
  'theory.area.n1':
    'σᵢ é o desvio-padrão por eixo do vértice i. A fórmula supõe vértices independentes; vértices irradiados da mesma estação dividem erros, e isso ela não enxerga.',

  'theory.debrief.title': '10 · O balanço final',
  'theory.debrief.p1':
    'Só no balanço a verdade aparece. Área, perímetro e EMQ dos lados não dependem do sistema de coordenadas. O erro em cada vértice exige alinhar os dois sistemas, que diferem apenas por uma translação (origem arbitrária, norte do mapa):',
  'theory.debrief.f1': 'ΔE_datum = média(E − E_verd)        ΔN_datum = média(N − N_verd)        (nos marcos de controle)',
  'theory.debrief.f2': 'erroᵢ = √((Eᵢ − ΔE_datum − Eᵢ,verd)² + (Nᵢ − ΔN_datum − Nᵢ,verd)²)        EMQ = √(Σ erroᵢ² / n)',
  'theory.debrief.p2':
    'A translação é ajustada nos marcos de controle, e não nos vértices, para que o erro de um vértice não se esconda dentro dela.',
  'theory.debrief.n1':
    'O que o jogo NÃO modela: ajustamento rigoroso da poligonal por mínimos quadrados, correlações entre observações, refração, curvatura terrestre e altimetria.',

  'theory.live.title': '11 · Seus números agora',
  'theory.live.p1':
    'Previsões feitas com o equipamento que você carrega e com as suas próprias medidas. Nada aqui usa a posição verdadeira dos marcos.',
  'theory.live.noKit': 'Comece um jogo para ver os números do seu equipamento.',
  'theory.live.kitTitle': 'Equipamento',
  'theory.live.instrument': 'Estação total',
  'theory.live.tripod': 'Tripé',
  'theory.live.target': 'Alvo',
  'theory.live.collimation': 'Colimação',
  'theory.live.twoFace': 'PD/PI ligado',
  'theory.live.tableTitle': 'Uma visada, por distância',
  'theory.live.colD': 'd',
  'theory.live.colDir': 'σ_dir',
  'theory.live.colCentring': 'centragem',
  'theory.live.colDist': 'σ_d',
  'theory.live.colTrans': 'σ_T (direção)',
  'theory.live.colPoint': 'σ_P, ré à mesma distância',
  'theory.live.colPointShort': 'σ_P, ré a 10 m',
  'theory.live.colCollimation': 'colimação (sistemático)',
  'theory.live.tableNote':
    'Centragem em segundos é a do tripé e a do alvo juntas, vistas daquela distância. σ_P é o erro radial de um ponto irradiado, sem o erro da estação. A colimação é um desvio fixo, não um σ, e some com PD/PI.',
  'theory.live.traverseTitle': 'Sua última poligonal',
  'theory.live.noTraverse': 'Ainda não há poligonal calculada. Abra os cálculos depois de fechar o anel de estações.',
  'theory.live.eAng': 'Erro angular obtido',
  'theory.live.tolGame': 'Tolerância do jogo (só σ_ET)',
  'theory.live.tolPredicted': 'Tolerância prevista (2σ, com centragem)',
  'theory.live.eLin': 'Erro linear obtido',
  'theory.live.eLinExpected': 'Erro linear esperado √E[e²]',
  'theory.live.relObserved': 'Precisão obtida',
  'theory.live.relExpected': 'Precisão esperada',
  'theory.live.relRequired': 'Precisão exigida',
  'theory.live.eLinSplit': 'Do erro linear esperado, {angles} m vêm dos ângulos e {distances} m das distâncias (somados em quadratura).',
  'theory.live.colStation': 'Estação',
  'theory.live.colBetaDir': 'direções',
  'theory.live.colBetaTripod': 'tripé',
  'theory.live.colBetaPrism': 'alvo',
  'theory.live.traverseNote':
    'Um erro dentro de ±2σ é o que o equipamento costuma dar. Fora da tolerância do jogo mas dentro da prevista: o instrumento cumpriu a especificação e a centragem fez o resto. Fora das duas: procure um engano.',
  'theory.live.areaTitle': 'Área',
  'theory.live.noRing': 'A incerteza da área aparece quando todos os vértices da propriedade tiverem sido visados.',
  'theory.live.area': 'Área levantada',
  'theory.live.sigmaArea': 'σ da área',
  'theory.live.sigmaAreaPct': 'σ relativo',
  'theory.live.worstCorner': 'Vértice mais incerto',
  'theory.live.areaNote':
    'Cada vértice usa as suas próprias visadas: a parte aleatória cai por √k, a fixa não. É uma estimativa conservadora e ignora o erro das estações.',
};
