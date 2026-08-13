//+------------------------------------------------------------------+
//|                                        AsianLondonSweepFVG.mq5    |
//|                                                        G-Labs     |
//|  Strategy:                                                        |
//|   1. Mark the Asian session high/low and the London session       |
//|      high/low.                                                    |
//|   2. After the New York open, wait for one of those levels to be  |
//|      swept (a liquidity grab beyond the high or low).             |
//|   3. Drop to the 1-minute chart and look for a Fair Value Gap     |
//|      (FVG) in the REVERSAL direction (high swept -> bearish FVG    |
//|      -> short ; low swept -> bullish FVG -> long).                |
//|   4. Enter on the FVG, stop beyond the sweep wick, target a        |
//|      configurable Risk:Reward (default 1:2).                       |
//|                                                                    |
//|  NOTE: All session times below are in BROKER SERVER TIME (24h).    |
//|        Use the on-chart panel to read the current server time and  |
//|        calibrate the windows to your broker. See the README.       |
//+------------------------------------------------------------------+
#property copyright "G-Labs"
#property version   "1.00"
#property strict
#property description "Asian/London liquidity sweep + 1-minute FVG reversal at the New York open."

#include <Trade/Trade.mqh>

//====================================================================
//  ENUMS
//====================================================================
enum ENUM_SWEEP_REF
  {
   SWEEP_OUTER = 0,   // Outer level only (max high / min low of both sessions)
   SWEEP_EITHER= 1    // Either level (nearest high / low is enough)
  };

enum ENUM_ENTRY_MODE
  {
   ENTRY_MARKET_ON_FVG = 0, // Market entry when the reversal FVG forms
   ENTRY_LIMIT_AT_FVG  = 1  // Pending limit inside the FVG (retracement)
  };

enum ENUM_BROKER_SCHEME
  {
   SCHEME_ICM_AUTO23 = 0, // Auto GMT+2/+3 by US DST (IC Markets & NY-close brokers)
   SCHEME_FIXED      = 1, // Use the fixed manual offset below
   SCHEME_LIVE_AUTO  = 2  // Detect from terminal live (falls back to Auto23 in tester)
  };

enum ENUM_SESSION_TZ
  {
   TZ_NEWYORK = 0, // Session inputs are in New York time (ET, DST-aware)
   TZ_SERVER  = 1, // Session inputs are already in broker server time
   TZ_GMT     = 2  // Session inputs are in GMT/UTC
  };

//====================================================================
//  INPUTS
//====================================================================
input group "=== Time zone / broker offset (auto) ==="
input ENUM_SESSION_TZ    InpSessionTZ     = TZ_NEWYORK;      // Time zone the session inputs below are in
input ENUM_BROKER_SCHEME InpBrokerScheme  = SCHEME_ICM_AUTO23; // How to determine broker server offset
input int                InpBrokerGMTFixed= 3;               // Fixed broker GMT offset (only if scheme=FIXED)

input group "=== Session windows (in the time zone selected above, 24h) ==="
input int    InpAsiaStartHour   = 20;   // Asia start hour
input int    InpAsiaStartMin    = 0;    // Asia start minute
input int    InpAsiaEndHour     = 0;    // Asia end hour (00 = midnight)
input int    InpAsiaEndMin      = 0;    // Asia end minute
input int    InpLondonStartHour = 2;    // London start hour
input int    InpLondonStartMin  = 0;    // London start minute
input int    InpLondonEndHour   = 5;    // London end hour
input int    InpLondonEndMin    = 0;    // London end minute
input int    InpNYStartHour     = 9;    // NY open / hunt START hour
input int    InpNYStartMin      = 0;    // NY open / hunt START minute
input int    InpNYEndHour       = 12;   // Hunt END / cutoff hour
input int    InpNYEndMin        = 0;    // Hunt END / cutoff minute

input group "=== Strategy logic ==="
input bool          InpUseAsia      = true;         // Use Asian session levels
input bool          InpUseLondon    = true;         // Use London session levels
input ENUM_SWEEP_REF InpSweepRef    = SWEEP_OUTER;  // Which level must be swept
input ENUM_ENTRY_MODE InpEntryMode  = ENTRY_MARKET_ON_FVG; // How to enter on the FVG
input double        InpRR           = 2.0;          // Risk:Reward (TP = RR x risk)
input int           InpSLBufferPts  = 20;           // Extra SL buffer beyond sweep (points)
input int           InpMinFVGPts    = 0;            // Minimum FVG size filter (points, 0=off)
input double        InpFVGEntryFrac = 0.5;          // Limit entry depth in gap (0=near,1=far)
input int           InpMaxTradesDay = 1;            // Max trades per day
input int           InpPendingExpiryMin = 30;       // Cancel unfilled limit after N min (0=off)

input group "=== RSI confirmation filter ==="
input bool             InpUseRSI      = true;         // Require RSI to confirm the reversal
input ENUM_TIMEFRAMES  InpRSITimeframe= PERIOD_M15;   // RSI timeframe
input int              InpRSIPeriod   = 14;           // RSI period
input double           InpRSIOversold = 35.0;         // Longs only if RSI <= this (oversold)
input double           InpRSIOverbought=65.0;         // Shorts only if RSI >= this (overbought)

input group "=== Risk management ==="
input bool   InpUseRiskPercent = true;   // Size by % risk (else fixed lot)
input double InpRiskPercent    = 1.0;    // Risk per trade (% of balance)
input double InpFixedLot        = 0.10;  // Fixed lot (if % risk is off)

input group "=== Trade management ==="
input bool   InpCloseAtCutoff  = true;      // Close open trade at cutoff time
input long   InpMagic          = 990011;    // Magic number
input int    InpSlippagePts     = 30;       // Max deviation (points)
input string InpComment         = "AL-Sweep-FVG";

input group "=== Display ==="
input bool   InpDrawObjects    = true;   // Draw levels / markers on chart
input bool   InpShowPanel      = true;   // Show info panel (Comment)

//====================================================================
//  GLOBALS
//====================================================================
CTrade   trade;

datetime g_curDay        = 0;      // server date currently being traded
int      g_brokerOff     = 3;      // broker GMT offset in hours (cached for the day)
bool     g_rangesReady   = false;  // Asia/London ranges computed for the day

bool     g_asiaValid     = false;
bool     g_londonValid   = false;
double   g_asiaHigh=0, g_asiaLow=0;
double   g_londonHigh=0, g_londonLow=0;

double   g_sweepHighLvl  = 0;      // the high level being watched
double   g_sweepLowLvl   = 0;      // the low level being watched

bool     g_swept         = false;
int      g_sweepDir      = 0;      // +1 high swept (SHORT bias), -1 low swept (LONG bias)
double   g_sweepExtreme  = 0;      // furthest price of the grab (for SL)
datetime g_sweepTime     = 0;

int      g_tradesToday   = 0;
bool     g_doneForDay    = false;
datetime g_lastBar       = 0;

int      g_rsiHandle     = INVALID_HANDLE;

string   g_pfx = "ALSFVG_";        // chart object prefix

//====================================================================
//  INIT / DEINIT
//====================================================================
int OnInit()
  {
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(InpSlippagePts);
   trade.SetTypeFillingBySymbol(_Symbol);

   if(InpRR <= 0)
     {
      Print("RR must be > 0");
      return(INIT_PARAMETERS_INCORRECT);
     }

   if(InpUseRSI)
     {
      g_rsiHandle = iRSI(_Symbol, InpRSITimeframe, InpRSIPeriod, PRICE_CLOSE);
      if(g_rsiHandle == INVALID_HANDLE)
        {
         Print("Failed to create RSI handle");
         return(INIT_FAILED);
        }
     }

   ResetDaily();
   PrintFormat("AsianLondonSweepFVG on %s | server now=%s | broker GMT+%d | session TZ=%s",
               _Symbol, TimeToString(TimeCurrent(), TIME_DATE|TIME_MINUTES),
               g_brokerOff, TZName());
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason)
  {
   if(g_rsiHandle != INVALID_HANDLE)
      IndicatorRelease(g_rsiHandle);
   ObjectsDeleteAll(0, g_pfx);
   Comment("");
  }

//--------------------------------------------------------------------
// RSI of the last CLOSED bar on the RSI timeframe (no repaint).
// Returns -1 if unavailable.
double LastClosedRSI()
  {
   if(g_rsiHandle == INVALID_HANDLE)
      return(-1.0);
   double buf[];
   if(CopyBuffer(g_rsiHandle, 0, 1, 1, buf) != 1)
      return(-1.0);
   return(buf[0]);
  }

// Does RSI confirm a reversal in the given direction?
//   dir = -1 (long)  -> need oversold  (RSI <= InpRSIOversold)
//   dir = +1 (short) -> need overbought(RSI >= InpRSIOverbought)
bool RSIConfirms(int dir)
  {
   if(!InpUseRSI)
      return(true);
   double r = LastClosedRSI();
   if(r < 0)
      return(false);      // no data yet -> don't trade
   if(dir < 0)
      return(r <= InpRSIOversold);
   return(r >= InpRSIOverbought);
  }

//====================================================================
//  MAIN
//====================================================================
void OnTick()
  {
   // New M1 bar?
   datetime bt = iTime(_Symbol, PERIOD_M1, 0);
   bool newBar = (bt != g_lastBar);
   if(newBar)
      g_lastBar = bt;

   datetime now = TimeCurrent();

   // Daily reset on date change
   datetime today = DayStart(now);
   if(today != g_curDay)
     {
      g_curDay = today;
      ResetDaily();
     }

   // The rest of the logic only advances on a closed M1 bar (no repaint)
   if(newBar)
      ProcessBar(now);

   // Cutoff handling / panel can update every tick
   HandleCutoff(now);
   if(InpShowPanel)
      UpdatePanel(now);
  }

//--------------------------------------------------------------------
void ProcessBar(datetime now)
  {
   datetime nyStart = InputToServer(now, InpNYStartHour, InpNYStartMin);
   datetime nyEnd   = InputToServer(now, InpNYEndHour,   InpNYEndMin);

   // 1) Compute session ranges once we reach the NY open
   if(!g_rangesReady && now >= nyStart)
     {
      ComputeRanges(now);
      g_rangesReady = true;
     }

   if(g_doneForDay || !g_rangesReady)
      return;

   if(now > nyEnd)
     {
      g_doneForDay = true;
      return;
     }

   // Only hunt inside [nyStart, nyEnd]
   if(now < nyStart)
      return;

   // 2) Detect the sweep on the last CLOSED M1 bar
   if(!g_swept)
      DetectSweep();

   if(!g_swept)
      return;

   // keep tracking the grab extreme for the stop-loss
   UpdateSweepExtreme();

   // 3) Once swept, look for the reversal FVG and enter
   if(HasOpenPosition() || HasPendingOrder())
      return;
   if(g_tradesToday >= InpMaxTradesDay)
     {
      g_doneForDay = true;
      return;
     }

   TryEnterOnFVG();
  }

//====================================================================
//  SESSION RANGES
//====================================================================
void ComputeRanges(datetime now)
  {
   g_asiaValid = false;
   g_londonValid = false;

   if(InpUseAsia)
     {
      datetime s, e;
      SessionBounds(now, InpAsiaStartHour, InpAsiaStartMin, InpAsiaEndHour, InpAsiaEndMin, s, e);
      g_asiaValid = SessionHiLo(s, e, g_asiaHigh, g_asiaLow);
     }
   if(InpUseLondon)
     {
      datetime s, e;
      SessionBounds(now, InpLondonStartHour, InpLondonStartMin, InpLondonEndHour, InpLondonEndMin, s, e);
      g_londonValid = SessionHiLo(s, e, g_londonHigh, g_londonLow);
     }

   // Build the high/low levels to watch
   double highs[2]; int hn = 0;
   double lows[2];  int ln = 0;
   if(g_asiaValid)   { highs[hn++] = g_asiaHigh;   lows[ln++] = g_asiaLow;   }
   if(g_londonValid) { highs[hn++] = g_londonHigh; lows[ln++] = g_londonLow; }

   if(hn == 0)
     {
      Print("No valid session ranges found - check session windows vs broker server time.");
      g_sweepHighLvl = 0; g_sweepLowLvl = 0;
      return;
     }

   // OUTER -> extreme (max high / min low). EITHER -> nearest (min high / max low).
   double hi = highs[0], lo = lows[0];
   for(int i = 1; i < hn; i++)
     {
      if(InpSweepRef == SWEEP_OUTER) hi = MathMax(hi, highs[i]);
      else                          hi = MathMin(hi, highs[i]);
     }
   for(int i = 1; i < ln; i++)
     {
      if(InpSweepRef == SWEEP_OUTER) lo = MathMin(lo, lows[i]);
      else                          lo = MathMax(lo, lows[i]);
     }
   g_sweepHighLvl = hi;
   g_sweepLowLvl  = lo;

   if(InpDrawObjects)
      DrawLevels(now);

   PrintFormat("Ranges ready | Asia[%s H:%.5f L:%.5f] London[%s H:%.5f L:%.5f] -> watch High:%.5f Low:%.5f",
               (g_asiaValid?"ok":"-"), g_asiaHigh, g_asiaLow,
               (g_londonValid?"ok":"-"), g_londonHigh, g_londonLow,
               g_sweepHighLvl, g_sweepLowLvl);
  }

// Compute high/low from M1 bars inside [st, en]
bool SessionHiLo(datetime st, datetime en, double &hi, double &lo)
  {
   if(en <= st) return false;
   MqlRates r[];
   int n = CopyRates(_Symbol, PERIOD_M1, st, en, r);
   if(n <= 0) return false;
   hi = -DBL_MAX; lo = DBL_MAX;
   for(int i = 0; i < n; i++)
     {
      if(r[i].high > hi) hi = r[i].high;
      if(r[i].low  < lo) lo = r[i].low;
     }
   return (hi > -DBL_MAX && lo < DBL_MAX);
  }

//====================================================================
//  SWEEP DETECTION
//====================================================================
void DetectSweep()
  {
   // Use the last CLOSED M1 bar (index 1)
   double bh = iHigh(_Symbol, PERIOD_M1, 1);
   double bl = iLow(_Symbol, PERIOD_M1, 1);
   datetime bt = iTime(_Symbol, PERIOD_M1, 1);
   if(bh == 0 && bl == 0) return;

   bool highSwept = (g_sweepHighLvl > 0 && bh > g_sweepHighLvl);
   bool lowSwept  = (g_sweepLowLvl  > 0 && bl < g_sweepLowLvl);

   if(!highSwept && !lowSwept)
      return;

   // If both broke on the same bar, take the larger displacement
   if(highSwept && lowSwept)
     {
      double up = bh - g_sweepHighLvl;
      double dn = g_sweepLowLvl - bl;
      if(up >= dn) lowSwept = false; else highSwept = false;
     }

   g_swept    = true;
   g_sweepTime = bt;
   if(highSwept)
     {
      g_sweepDir     = +1;              // high taken -> short bias
      g_sweepExtreme = bh;
     }
   else
     {
      g_sweepDir     = -1;              // low taken -> long bias
      g_sweepExtreme = bl;
     }

   if(InpDrawObjects)
      MarkSweep(bt, (highSwept ? g_sweepHighLvl : g_sweepLowLvl), highSwept);

   PrintFormat("Sweep detected: %s at %.5f (bar %s)",
               (highSwept ? "HIGH (short bias)" : "LOW (long bias)"),
               g_sweepExtreme, TimeToString(bt, TIME_MINUTES));
  }

void UpdateSweepExtreme()
  {
   double bh = iHigh(_Symbol, PERIOD_M1, 1);
   double bl = iLow(_Symbol, PERIOD_M1, 1);
   if(g_sweepDir > 0) g_sweepExtreme = MathMax(g_sweepExtreme, bh);
   else               g_sweepExtreme = MathMin(g_sweepExtreme, bl);
  }

//====================================================================
//  FVG DETECTION + ENTRY
//====================================================================
// 3-bar FVG using closed bars 1(newest),2,3(oldest).
//  Bullish FVG (gap up):   high[3] < low[1]  -> zone [high[3], low[1]]
//  Bearish FVG (gap down): low[3]  > high[1] -> zone [high[1], low[3]]
void TryEnterOnFVG()
  {
   double h1 = iHigh(_Symbol, PERIOD_M1, 1), l1 = iLow(_Symbol, PERIOD_M1, 1);
   double h3 = iHigh(_Symbol, PERIOD_M1, 3), l3 = iLow(_Symbol, PERIOD_M1, 3);
   datetime t1 = iTime(_Symbol, PERIOD_M1, 1);

   // FVG must form AFTER the sweep
   if(t1 <= g_sweepTime)
      return;

   double point = _Point;
   double minGap = InpMinFVGPts * point;

   if(g_sweepDir < 0) // long bias -> need bullish FVG
     {
      if(h3 < l1)
        {
         double gapLo = h3, gapHi = l1;      // gap zone
         if((gapHi - gapLo) < minGap) return;
         if(!RSIConfirms(-1)) return;         // RSI must be oversold
         OpenLong(gapLo, gapHi);
        }
     }
   else // short bias -> need bearish FVG
     {
      if(l3 > h1)
        {
         double gapLo = h1, gapHi = l3;      // gap zone
         if((gapHi - gapLo) < minGap) return;
         if(!RSIConfirms(+1)) return;         // RSI must be overbought
         OpenShort(gapLo, gapHi);
        }
     }
  }

void OpenLong(double gapLo, double gapHi)
  {
   double buffer = InpSLBufferPts * _Point;
   double sl = g_sweepExtreme - buffer;
   double entry;

   if(InpEntryMode == ENTRY_MARKET_ON_FVG)
      entry = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   else // limit inside the gap on retrace
      entry = gapLo + (gapHi - gapLo) * (1.0 - InpFVGEntryFrac);

   double risk = entry - sl;
   if(risk <= 0) { Print("Long skipped: non-positive risk"); return; }
   double tp = entry + risk * InpRR;

   entry = NormPrice(entry); sl = NormPrice(sl); tp = NormPrice(tp);
   double lots = CalcLots(risk);
   if(lots <= 0) return;

   bool ok;
   if(InpEntryMode == ENTRY_MARKET_ON_FVG)
      ok = trade.Buy(lots, _Symbol, 0.0, sl, tp, InpComment);
   else
     {
      datetime exp = 0; ENUM_ORDER_TYPE_TIME tt = ORDER_TIME_GTC;
      if(InpPendingExpiryMin > 0){ exp = TimeCurrent() + InpPendingExpiryMin*60; tt = ORDER_TIME_SPECIFIED; }
      ok = trade.BuyLimit(lots, entry, _Symbol, sl, tp, tt, exp, InpComment);
     }

   if(ok)
     {
      g_tradesToday++;
      if(InpDrawObjects) MarkEntry(true, entry);
      PrintFormat("LONG %s %.2f lots | entry %.5f SL %.5f TP %.5f (RR %.1f)",
                  (InpEntryMode==ENTRY_MARKET_ON_FVG?"MKT":"LMT"), lots, entry, sl, tp, InpRR);
     }
   else
      PrintFormat("Long order failed: %d %s", trade.ResultRetcode(), trade.ResultRetcodeDescription());
  }

void OpenShort(double gapLo, double gapHi)
  {
   double buffer = InpSLBufferPts * _Point;
   double sl = g_sweepExtreme + buffer;
   double entry;

   if(InpEntryMode == ENTRY_MARKET_ON_FVG)
      entry = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   else
      entry = gapHi - (gapHi - gapLo) * (1.0 - InpFVGEntryFrac);

   double risk = sl - entry;
   if(risk <= 0) { Print("Short skipped: non-positive risk"); return; }
   double tp = entry - risk * InpRR;

   entry = NormPrice(entry); sl = NormPrice(sl); tp = NormPrice(tp);
   double lots = CalcLots(risk);
   if(lots <= 0) return;

   bool ok;
   if(InpEntryMode == ENTRY_MARKET_ON_FVG)
      ok = trade.Sell(lots, _Symbol, 0.0, sl, tp, InpComment);
   else
     {
      datetime exp = 0; ENUM_ORDER_TYPE_TIME tt = ORDER_TIME_GTC;
      if(InpPendingExpiryMin > 0){ exp = TimeCurrent() + InpPendingExpiryMin*60; tt = ORDER_TIME_SPECIFIED; }
      ok = trade.SellLimit(lots, entry, _Symbol, sl, tp, tt, exp, InpComment);
     }

   if(ok)
     {
      g_tradesToday++;
      if(InpDrawObjects) MarkEntry(false, entry);
      PrintFormat("SHORT %s %.2f lots | entry %.5f SL %.5f TP %.5f (RR %.1f)",
                  (InpEntryMode==ENTRY_MARKET_ON_FVG?"MKT":"LMT"), lots, entry, sl, tp, InpRR);
     }
   else
      PrintFormat("Short order failed: %d %s", trade.ResultRetcode(), trade.ResultRetcodeDescription());
  }

//====================================================================
//  RISK / SIZING
//====================================================================
double CalcLots(double riskPrice)
  {
   if(!InpUseRiskPercent)
      return NormalizeLot(InpFixedLot);

   double bal       = AccountInfoDouble(ACCOUNT_BALANCE);
   double riskMoney = bal * InpRiskPercent / 100.0;
   double tickVal   = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double tickSize  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(tickSize <= 0 || tickVal <= 0)
      return NormalizeLot(InpFixedLot);

   double lossPerLot = (riskPrice / tickSize) * tickVal;
   if(lossPerLot <= 0)
      return NormalizeLot(InpFixedLot);

   double lots = riskMoney / lossPerLot;
   return NormalizeLot(lots);
  }

double NormalizeLot(double lots)
  {
   double minL = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxL = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   if(step <= 0) step = 0.01;
   lots = MathFloor(lots / step) * step;
   if(lots < minL) lots = minL;
   if(lots > maxL) lots = maxL;
   return lots;
  }

double NormPrice(double p)
  {
   return NormalizeDouble(p, _Digits);
  }

//====================================================================
//  POSITION / ORDER HELPERS
//====================================================================
bool HasOpenPosition()
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) == _Symbol &&
         PositionGetInteger(POSITION_MAGIC) == InpMagic)
         return true;
     }
   return false;
  }

bool HasPendingOrder()
  {
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      ulong tk = OrderGetTicket(i);
      if(tk == 0) continue;
      if(OrderGetString(ORDER_SYMBOL) == _Symbol &&
         OrderGetInteger(ORDER_MAGIC) == InpMagic)
         return true;
     }
   return false;
  }

void CloseMyPositions()
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) == _Symbol &&
         PositionGetInteger(POSITION_MAGIC) == InpMagic)
         trade.PositionClose(tk);
     }
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      ulong tk = OrderGetTicket(i);
      if(tk == 0) continue;
      if(OrderGetString(ORDER_SYMBOL) == _Symbol &&
         OrderGetInteger(ORDER_MAGIC) == InpMagic)
         trade.OrderDelete(tk);
     }
  }

void HandleCutoff(datetime now)
  {
   datetime nyEnd = InputToServer(now, InpNYEndHour, InpNYEndMin);
   if(now > nyEnd)
     {
      if(InpCloseAtCutoff && (HasOpenPosition() || HasPendingOrder()))
         CloseMyPositions();
     }
  }

//====================================================================
//  TIME HELPERS
//====================================================================
datetime DayStart(datetime t)
  {
   MqlDateTime dt; TimeToStruct(t, dt);
   dt.hour = 0; dt.min = 0; dt.sec = 0;
   return StructToTime(dt);
  }

// Returns start/end (in SERVER time) for a session, handling windows that
// wrap past midnight in the selected input time zone.
void SessionBounds(datetime ref, int sh, int sm, int eh, int em, datetime &start, datetime &end)
  {
   start = InputToServer(ref, sh, sm);
   end   = InputToServer(ref, eh, em);
   if(end <= start)          // wraps midnight -> session started the previous day
      start -= 86400;
  }

//====================================================================
//  TIME ZONE / BROKER OFFSET (auto)
//====================================================================
// Convert a wall-clock hour:min (in the selected input TZ, on the input-TZ
// day that contains 'refServer') into a broker SERVER datetime.
datetime InputToServer(datetime refServer, int h, int m)
  {
   int shift = g_brokerOff - InputTZOffset(refServer);   // server = input + shift (hours)
   datetime refInput = refServer - (datetime)shift * 3600;
   MqlDateTime d; TimeToStruct(refInput, d);
   d.hour = h; d.min = m; d.sec = 0;
   datetime targetInput = StructToTime(d);
   return targetInput + (datetime)shift * 3600;
  }

// GMT offset (hours) of the time zone the session inputs are given in.
int InputTZOffset(datetime refServer)
  {
   switch(InpSessionTZ)
     {
      case TZ_SERVER: return g_brokerOff;
      case TZ_GMT:    return 0;
      case TZ_NEWYORK:
        {
         datetime gmtApprox = refServer - (datetime)g_brokerOff * 3600;
         return (IsUSDST(gmtApprox) ? -4 : -5);
        }
     }
   return g_brokerOff;
  }

// Determine broker GMT offset (hours) for a given server time.
int ComputeBrokerOffset(datetime t)
  {
   switch(InpBrokerScheme)
     {
      case SCHEME_FIXED:
         return InpBrokerGMTFixed;
      case SCHEME_LIVE_AUTO:
         if(MQLInfoInteger(MQL_TESTER))
            return (IsUSDST(t) ? 3 : 2);
         return (int)MathRound((double)(TimeTradeServer() - TimeGMT()) / 3600.0);
      case SCHEME_ICM_AUTO23:
      default:
         return (IsUSDST(t) ? 3 : 2);   // GMT+2 winter, GMT+3 during US DST
     }
  }

// US Daylight Saving Time: 2nd Sunday of March 02:00 -> 1st Sunday of Nov 02:00.
bool IsUSDST(datetime t)
  {
   MqlDateTime d; TimeToStruct(t, d);
   datetime dstStart = NthSunday(d.year, 3, 2)  + 2 * 3600;
   datetime dstEnd   = NthSunday(d.year, 11, 1) + 2 * 3600;
   return (t >= dstStart && t < dstEnd);
  }

datetime NthSunday(int year, int month, int n)
  {
   MqlDateTime d;
   d.year = year; d.mon = month; d.day = 1;
   d.hour = 0; d.min = 0; d.sec = 0;
   datetime first = StructToTime(d);
   MqlDateTime fd; TimeToStruct(first, fd);
   int firstSunday = 1 + ((7 - fd.day_of_week) % 7);
   d.day = firstSunday + (n - 1) * 7;
   return StructToTime(d);
  }

string TZName()
  {
   switch(InpSessionTZ)
     {
      case TZ_NEWYORK: return "New York";
      case TZ_GMT:     return "GMT";
      default:         return "Server";
     }
  }

//====================================================================
//  DAILY RESET
//====================================================================
void ResetDaily()
  {
   g_brokerOff    = ComputeBrokerOffset(TimeCurrent());
   g_rangesReady  = false;
   g_asiaValid    = false;
   g_londonValid  = false;
   g_asiaHigh=0; g_asiaLow=0; g_londonHigh=0; g_londonLow=0;
   g_sweepHighLvl=0; g_sweepLowLvl=0;
   g_swept        = false;
   g_sweepDir     = 0;
   g_sweepExtreme = 0;
   g_sweepTime    = 0;
   g_tradesToday  = 0;
   g_doneForDay   = false;
   if(InpDrawObjects)
      ObjectsDeleteAll(0, g_pfx);
  }

//====================================================================
//  DRAWING
//====================================================================
void HLine(string name, double price, color clr, string text)
  {
   name = g_pfx + name;
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_HLINE, 0, 0, price);
   ObjectSetDouble(0, name, OBJPROP_PRICE, price);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
   ObjectSetInteger(0, name, OBJPROP_STYLE, STYLE_DOT);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, 1);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
  }

void DrawLevels(datetime now)
  {
   if(g_asiaValid)
     {
      HLine("AsiaH", g_asiaHigh, clrDeepSkyBlue, "Asia High");
      HLine("AsiaL", g_asiaLow,  clrDeepSkyBlue, "Asia Low");
     }
   if(g_londonValid)
     {
      HLine("LonH", g_londonHigh, clrOrange, "London High");
      HLine("LonL", g_londonLow,  clrOrange, "London Low");
     }
  }

void MarkSweep(datetime t, double price, bool high)
  {
   string name = g_pfx + "Sweep";
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_ARROW, 0, t, price);
   ObjectSetInteger(0, name, OBJPROP_TIME, t);
   ObjectSetDouble(0, name, OBJPROP_PRICE, price);
   ObjectSetInteger(0, name, OBJPROP_ARROWCODE, high ? 234 : 233);
   ObjectSetInteger(0, name, OBJPROP_COLOR, high ? clrRed : clrLime);
  }

void MarkEntry(bool isLong, double price)
  {
   string name = g_pfx + "Entry_" + IntegerToString((int)TimeCurrent());
   if(ObjectCreate(0, name, OBJ_ARROW, 0, TimeCurrent(), price))
     {
      ObjectSetInteger(0, name, OBJPROP_ARROWCODE, isLong ? 233 : 234);
      ObjectSetInteger(0, name, OBJPROP_COLOR, isLong ? clrAqua : clrMagenta);
      ObjectSetInteger(0, name, OBJPROP_WIDTH, 2);
     }
  }

//====================================================================
//  PANEL
//====================================================================
void UpdatePanel(datetime now)
  {
   string state;
   if(g_doneForDay)          state = "DONE for today";
   else if(!g_rangesReady)   state = "Waiting for NY open to mark ranges";
   else if(!g_swept)         state = "Ranges set - waiting for a sweep";
   else if(g_sweepDir > 0)   state = "HIGH swept -> hunting BEARISH FVG (short)";
   else                      state = "LOW swept -> hunting BULLISH FVG (long)";

   string s = "";
   s += "=== Asian/London Sweep + M1 FVG ===\n";
   s += "Server time : " + TimeToString(now, TIME_DATE|TIME_MINUTES) + StringFormat("  (broker GMT+%d)\n", g_brokerOff);
   s += "Session TZ  : " + TZName() + "\n";
   s += "State       : " + state + "\n";
   s += StringFormat("Asia   H/L  : %s\n", g_asiaValid   ? DoubleToString(g_asiaHigh,_Digits)+" / "+DoubleToString(g_asiaLow,_Digits)   : "-");
   s += StringFormat("London H/L  : %s\n", g_londonValid ? DoubleToString(g_londonHigh,_Digits)+" / "+DoubleToString(g_londonLow,_Digits): "-");
   if(g_rangesReady)
      s += StringFormat("Watch H/L   : %.*f / %.*f\n", _Digits, g_sweepHighLvl, _Digits, g_sweepLowLvl);
   s += StringFormat("Trades today: %d / %d\n", g_tradesToday, InpMaxTradesDay);
   if(InpUseRSI)
     {
      double r = LastClosedRSI();
      s += StringFormat("RSI(%s)     : %s  [long<=%.0f short>=%.0f]\n",
                        EnumToString(InpRSITimeframe), (r < 0 ? "n/a" : DoubleToString(r, 1)),
                        InpRSIOversold, InpRSIOverbought);
     }
   Comment(s);
  }
//+------------------------------------------------------------------+
