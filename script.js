const $ = id => document.getElementById(id);

const HOJE = new Date();
const MES_AGORA = String(HOJE.getMonth() + 1).padStart(2, '0');

async function buscar(url) {
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error('HTTP ' + resposta.status);
  return resposta.json();
}

async function precoBitcoin(desde) {
  const url = 'https://community-api.coinmetrics.io/v4/timeseries/asset-metrics' +
    '?assets=btc&metrics=PriceUSD&frequency=1d&start_time=' + desde + '&page_size=10000';
  const json = await buscar(url);
  const linhas = json.data || [];
  return linhas.map(linha => [linha.time.slice(0, 10), Number(linha.PriceUSD)]);
}

async function serieBcb(numero, desdeAno) {
  const linhas = [];
  for (let ano = desdeAno; ano <= HOJE.getFullYear(); ano++) {
    const url = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.' + numero +
      '/dados?formato=json&dataInicial=01/01/' + ano + '&dataFinal=31/12/' + ano;
    linhas.push(...await buscar(url));
  }
  return linhas;
}

function dataIso(texto) {
  const p = texto.split('/');
  return p[2] + '-' + p[1] + '-' + p[0];
}

function numero(texto) {
  return Number(String(texto).replace(',', '.'));
}

function real(valor) {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: valor >= 1000 ? 0 : 2,
  });
}

function percentual(valor) {
  return (valor >= 0 ? '+' : '') + valor.toFixed(1) + '%';
}

function mostrarStatus(texto, erro) {
  const status = $('status');
  status.textContent = texto;
  status.className = erro ? 'status error' : 'status';
}

$('year').textContent = HOJE.getFullYear();

const inicio = $('start');
inicio.max = HOJE.getFullYear() + '-' + MES_AGORA;
inicio.value = (HOJE.getFullYear() - 3) + '-' + MES_AGORA;

$('form').addEventListener('submit', async function (evento) {
  evento.preventDefault();

  const entrada = Number($('initial').value) || 0;
  const aporte = Number($('amount').value) || 0;
  const desde = inicio.value; // '2023-11'

  if (!entrada && !aporte) {
    mostrarStatus('Informe uma entrada ou aporte mensal', true);
    return;
  }
  if (!desde) {
    mostrarStatus('Escolha o mês de início', true);
    return;
  }

  $('simulate').disabled = true;
  mostrarStatus('Buscando dados...', false);

  try {
    const bitcoin = await precoBitcoin(desde + '-01');
    const cambio = await serieBcb(1, Number(desde.slice(0, 4)));
    const cdi = await serieBcb(4391, Number(desde.slice(0, 4)));

    const cambioPorDia = {};
    for (const item of cambio) cambioPorDia[dataIso(item.data)] = numero(item.valor);

    const precos = {};
    let taxa = 0;
    for (const [dia, preco] of bitcoin) {
      if (cambioPorDia[dia]) taxa = cambioPorDia[dia];
      if (dia < desde || taxa === 0) continue;
      precos[dia.slice(0, 7)] = preco * taxa;
    }

    const meses = Object.keys(precos).sort();
    if (meses.length === 0) throw new Error('Sem dados para o período escolhido');

    const cdiPorMes = {};
    for (const item of cdi) cdiPorMes[dataIso(item.data).slice(0, 7)] = 1 + numero(item.valor) / 100;

    let quantidade = entrada / precos[meses[0]];
    let investido = entrada;
    let cdiTotal = entrada;

    for (const mes of meses) {
      quantidade += aporte / precos[mes];
      investido += aporte;
      cdiTotal = (cdiTotal + aporte) * (cdiPorMes[mes] || 1);
    }

    const valorFinal = quantidade * precos[meses[meses.length - 1]];
    const ganho = valorFinal - investido;

    $('current').textContent = real(valorFinal);
    $('currentDelta').textContent = percentual(ganho / investido * 100);
    $('currentDelta').className = 'delta ' + (ganho >= 0 ? 'pos' : 'neg');
    $('invested').textContent = real(investido);
    $('cdi').textContent = real(cdiTotal);
    $('btc').textContent = quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 8 }) + ' BTC';
    $('results').hidden = false;
    mostrarStatus('', false);
    $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (erro) {
    console.error(erro);
    mostrarStatus('Não foi possível buscar os dados. Tente novamente.', true);
  } finally {
    $('simulate').disabled = false;
  }
});
