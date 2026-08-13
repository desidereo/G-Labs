//+------------------------------------------------------------------+
//|                                                LondonORBPro.mq5  |
//|                                                          G-Labs  |
//|                                                                   |
//|  LONDON ORB PRO - London-open range breakout with a volatility-   |
//|  regime filter and a professional risk-management suite.          |
//|                                                                   |
//|  Core rule (all times LONDON wall clock, DST automatic):          |
//|   1. Range = high/low of 03:00-08:00 London.                      |
//|   2. VOLATILITY FILTER: trade only if today's range >= mult x     |
//|      the median of the previous 20 valid days' ranges.            |
//|   3. From 08:00, OCO stop orders at range high (buy) / low        |
//|      (sell); SL = opposite side. Orders expire 11:00 London.      |
//|   4. Open position closed 17:00 London. One trade per day.        |
//|                                                                   |
//|  Validation status (honest): the base rule has a real GROSS edge  |
//|  (t=2.98, 2,797 trades 2022-24) that retail costs consume. The    |
//|  volatility filter was PRE-REGISTERED and then tested once on     |
//|  fresh 2026 data: pooled net +0.072 R/trade, net-positive on 3/4  |
//|  symbols (191 trades, t=0.93). Encouraging but NOT statistical    |
//|  proof. See mt5/research/validation_report.md. No profit is       |
//|  guaranteed; use risk settings you can afford.                    |
//+------------------------------------------------------------------+
#property copyright "G-Labs"
#property version   "1.10"
#property strict
#property description "London opening-range breakout + volatility-regime filter."
#property description "Prop-firm ready: daily loss limit, max drawdown halt, spread guard."

#include <Trade/Trade.mqh>

//====================================================================
//  INPUTS
//====================================================================
enum ENUM_BROKER_SCHEME
  {
   SCHEME_ICM_AUTO23 = 0, // Auto GMT+2/+3 by US DST (IC Markets & NY-close brokers)
   SCHEME_FIXED      = 1  // Use the fixed manual offset below
  };

input group "=== Broker time zone ==="
input ENUM_BROKER_SCHEME InpBrokerScheme   = SCHEME_ICM_AUTO23; // How to determine broker GMT offset
input int                InpBrokerGMTFixed = 3;                 // Fixed broker GMT offset (if scheme=FIXED)

input group "=== Session (LONDON wall-clock time, 24h) ==="
input int    InpRangeStartHour = 3;    // Range window start hour
input int    InpRangeEndHour   = 8;    // Range window end hour (= breakout window start)
input int    InpHuntEndHour    = 11;   // Breakout window end (pending orders removed)
input int    InpExitHour       = 17;   // Time exit: close any open position

input group "=== Volatility-regime filter ==="
input bool   InpUseVolFilter = true;   // Trade only on larger-than-usual ranges
input int    InpVolLookback  = 20;     // Trailing days for the median range
input double InpVolMult      = 1.0;    // Today's range must be >= mult x median

input group "=== Risk management ==="
input bool   InpUseRiskPercent = true;   // Size by % risk (else fixed lot)
input double InpRiskPercent    = 0.5;    // Risk per trade (% of balance)
input double InpFixedLot       = 0.10;   // Fixed lot (if % risk is off)
input int    InpMaxSpreadPts   = 30;     // Skip placement if spread > this (points, 0=off)
input int    InpMinRangePts    = 0;      // Skip day if range smaller (points, 0=off)
input int    InpMaxRangePts    = 0;      // Skip day if range larger (points, 0=off)

input group "=== Account protection (prop-firm) ==="
input double InpDailyLossPct   = 0.0;    // Halt for the day at this equity loss % (0=off)
input double InpMaxDrawdownPct = 0.0;    // Halt EA at this % below peak equity (0=off)
input bool   InpCloseOnHalt    = true;   // Close open position when a halt triggers

input group "=== Trading days ==="
input bool   InpTradeMon = true;
input bool   InpTradeTue = true;
input bool   InpTradeWed = true;
input bool   InpTradeThu = true;
input bool   InpTradeFri = true;

input group "=== Optional exits (NOT validated - off = researched rule) ==="
input double InpTargetR    = 0.0;      // Take profit at N x range (0=off, time exit)
input double InpBreakEvenR = 0.0;      // Move SL to entry at +N x range (0=off)
input double InpTrailR     = 0.0;      // Trail SL by N x range (0=off)

input group "=== Trade settings ==="
input long   InpMagic       = 990033;    // Magic number
input int    InpSlippagePts = 30;        // Max deviation (points)
input string InpComment     = "LondonORB Pro";

input group "=== Display ==="
input bool   InpDrawObjects = true;      // Draw the range on the chart
input bool   InpShowPanel   = true;      // Show dashboard panel

//====================================================================
//  GLOBALS
//====================================================================
CTrade   trade;

datetime g_curLonDay   = 0;     // London date (00:00) currently being managed
bool     g_placed      = false; // OCO stops placed for this day
bool     g_traded      = false; // a position existed today (one trade/day)
double   g_rangeHigh   = 0.0;
double   g_rangeLow    = 0.0;
double   g_volMedian   = 0.0;   // trailing median of prior ranges (0 = not computed)
int      g_volCount    = 0;     // how many prior ranges were found
bool     g_volPass     = false; // today's range passed the filter
bool     g_dayHalt     = false; // daily loss limit hit
bool     g_hardHalt    = false; // max drawdown hit (until EA restart w/ reset)
double   g_dayStartEq  = 0.0;   // equity at London midnight
string   g_skipReason  = "";    // why today was skipped (panel display)

#define PANEL_PREFIX "LORBP_"

string PeakGVName() { return "LORBP_peak_" + _Symbol + "_" + IntegerToString((int)InpMagic); }

//====================================================================
//  TIME ZONE HELPERS
//====================================================================
datetime NthSunday(const int year, const int month, const int n)
  {
   MqlDateTime s; ZeroMemory(s);
   s.year = year; s.mon = month; s.day = 1;
   datetime d1 = StructToTime(s);
   MqlDateTime t; TimeToStruct(d1, t);
   int firstSun = 1 + ((7 - t.day_of_week) % 7);
   s.day = firstSun + (n - 1) * 7;
   return StructToTime(s);
  }

datetime LastSunday(const int year, const int month)
  {
   static const int mdays[13] = {0,31,28,31,30,31,30,31,31,30,31,30,31};
   int dmax = mdays[month];
   if(month == 2 && (year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)))
      dmax = 29;
   MqlDateTime s; ZeroMemory(s);
   s.year = year; s.mon = month; s.day = dmax;
   datetime dl = StructToTime(s);
   MqlDateTime t; TimeToStruct(dl, t);
   return dl - t.day_of_week * 86400;
  }

bool IsUSDst(const datetime t)
  {
   MqlDateTime s; TimeToStruct(t, s);
   datetime beg = NthSunday(s.year, 3, 2)  + 2 * 3600;
   datetime end = NthSunday(s.year, 11, 1) + 2 * 3600;
   return (t >= beg && t < end);
  }

bool IsUKDst(const datetime utc)
  {
   MqlDateTime s; TimeToStruct(utc, s);
   datetime beg = LastSunday(s.year, 3)  + 1 * 3600;
   datetime end = LastSunday(s.year, 10) + 1 * 3600;
   return (utc >= beg && utc < end);
  }

int BrokerOffset(const datetime serverTime)
  {
   if(InpBrokerScheme == SCHEME_FIXED)
      return InpBrokerGMTFixed;
   return IsUSDst(serverTime) ? 3 : 2;   // IC Markets convention
  }

datetime ServerToUTC(const datetime srv)   { return srv - BrokerOffset(srv) * 3600; }
datetime UTCToLondon(const datetime utc)   { return utc + (IsUKDst(utc) ? 1 : 0) * 3600; }
datetime ServerToLondon(const datetime srv){ return UTCToLondon(ServerToUTC(srv)); }

datetime LondonToUTC(const datetime lonWall)
  {
   datetime utc = lonWall - (IsUKDst(lonWall) ? 1 : 0) * 3600;
   utc = lonWall - (IsUKDst(utc) ? 1 : 0) * 3600;
   return utc;
  }

datetime UTCToServer(const datetime utc)
  {
   datetime srv = utc + BrokerOffset(utc) * 3600;
   srv = utc + BrokerOffset(srv) * 3600;
   return srv;
  }

datetime LondonHourToServer(const datetime lonDay, const int hour)
  {
   return UTCToServer(LondonToUTC(lonDay + hour * 3600));
  }

//====================================================================
//  POSITION / ORDER BOOKKEEPING
//====================================================================
bool HasPosition()
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetInteger(POSITION_MAGIC) == InpMagic &&
         PositionGetString(POSITION_SYMBOL) == _Symbol)
         return true;
     }
   return false;
  }

int PendingCount()
  {
   int n = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      ulong ticket = OrderGetTicket(i);
      if(ticket == 0) continue;
      if(OrderGetInteger(ORDER_MAGIC) == InpMagic &&
         OrderGetString(ORDER_SYMBOL) == _Symbol)
         n++;
     }
   return n;
  }

void DeletePendings()
  {
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      ulong ticket = OrderGetTicket(i);
      if(ticket == 0) continue;
      if(OrderGetInteger(ORDER_MAGIC) == InpMagic &&
         OrderGetString(ORDER_SYMBOL) == _Symbol)
         trade.OrderDelete(ticket);
     }
  }

void ClosePosition()
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetInteger(POSITION_MAGIC) == InpMagic &&
         PositionGetString(POSITION_SYMBOL) == _Symbol)
         trade.PositionClose(ticket);
     }
  }

//====================================================================
//  SIZING
//====================================================================
double LotsForRisk(const double slDistance)
  {
   if(!InpUseRiskPercent)
      return InpFixedLot;
   double tickSize  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   if(tickSize <= 0.0 || tickValue <= 0.0 || slDistance <= 0.0)
      return InpFixedLot;
   double riskMoney  = AccountInfoDouble(ACCOUNT_BALANCE) * InpRiskPercent / 100.0;
   double lossPerLot = slDistance / tickSize * tickValue;
   double lots       = riskMoney / lossPerLot;

   double minLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double step   = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   if(step > 0.0)
      lots = MathFloor(lots / step) * step;
   return MathMin(MathMax(lots, minLot), maxLot);
  }

//====================================================================
//  RANGE COMPUTATION
//====================================================================
bool ComputeRange(const datetime srvStart, const datetime srvEnd,
                  double &rHigh, double &rLow)
  {
   int iStart = iBarShift(_Symbol, PERIOD_M1, srvStart, false);
   int iEnd   = iBarShift(_Symbol, PERIOD_M1, srvEnd - 60, false);
   if(iStart < 0 || iEnd < 0 || iEnd > iStart)
      return false;
   int count = iStart - iEnd + 1;
   int expected = (int)((srvEnd - srvStart) / 60);
   if(count < expected * 2 / 3)
      return false;
   int hIdx = iHighest(_Symbol, PERIOD_M1, MODE_HIGH, count, iEnd);
   int lIdx = iLowest(_Symbol, PERIOD_M1, MODE_LOW,  count, iEnd);
   if(hIdx < 0 || lIdx < 0)
      return false;
   rHigh = iHigh(_Symbol, PERIOD_M1, hIdx);
   rLow  = iLow(_Symbol, PERIOD_M1, lIdx);
   return (rHigh > rLow);
  }

//====================================================================
//  VOLATILITY-REGIME FILTER
//====================================================================
// Collect up to InpVolLookback prior valid opening ranges (most recent first).
int CollectPriorRanges(const datetime lonDay, double &out[])
  {
   int found = 0;
   for(int back = 1; back <= 90 && found < InpVolLookback; back++)
     {
      datetime pd = lonDay - back * 86400;
      MqlDateTime pt; TimeToStruct(pd, pt);
      if(pt.day_of_week == 0 || pt.day_of_week == 6)
         continue;
      double rh, rl;
      datetime s = LondonHourToServer(pd, InpRangeStartHour);
      datetime e = LondonHourToServer(pd, InpRangeEndHour);
      if(!ComputeRange(s, e, rh, rl))
         continue;
      out[found++] = rh - rl;
     }
   return found;
  }

double MedianOf(double &a[], const int n)
  {
   if(n <= 0) return 0.0;
   double tmp[];
   ArrayResize(tmp, n);
   ArrayCopy(tmp, a, 0, 0, n);
   ArraySort(tmp);
   if(n % 2 == 1)
      return tmp[n / 2];
   return 0.5 * (tmp[n / 2 - 1] + tmp[n / 2]);
  }

// true if today's range passes the volatility filter (also fills panel state)
bool VolFilterPass(const double rangeSize)
  {
   if(!InpUseVolFilter)
     {
      g_volPass = true;
      return true;
     }
   double hist[];
   ArrayResize(hist, InpVolLookback);
   g_volCount  = CollectPriorRanges(g_curLonDay, hist);
   g_volMedian = MedianOf(hist, g_volCount);
   if(g_volCount < InpVolLookback)
     {
      // not enough history in the terminal: fail-open with a warning rather
      // than silently never trading on a fresh chart
      Print("VolFilter: only ", g_volCount, "/", InpVolLookback,
            " prior ranges found - filter skipped today");
      g_volPass = true;
      return true;
     }
   g_volPass = (rangeSize >= InpVolMult * g_volMedian);
   return g_volPass;
  }

//====================================================================
//  ACCOUNT PROTECTION
//====================================================================
double PeakEquity()
  {
   string gv = PeakGVName();
   double eq = AccountInfoDouble(ACCOUNT_EQUITY);
   double peak = GlobalVariableCheck(gv) ? GlobalVariableGet(gv) : eq;
   if(eq > peak)
     {
      peak = eq;
      GlobalVariableSet(gv, peak);
     }
   return peak;
  }

// returns true if trading is halted (and enforces the halt actions)
bool ProtectionHalted()
  {
   double eq = AccountInfoDouble(ACCOUNT_EQUITY);

   if(InpMaxDrawdownPct > 0.0)
     {
      double peak = PeakEquity();
      if(!g_hardHalt && peak > 0.0 && eq <= peak * (1.0 - InpMaxDrawdownPct / 100.0))
        {
         g_hardHalt = true;
         Print("MAX DRAWDOWN HALT: equity ", DoubleToString(eq, 2),
               " is ", DoubleToString(InpMaxDrawdownPct, 1), "% below peak ",
               DoubleToString(peak, 2), " - trading stopped");
        }
     }

   if(InpDailyLossPct > 0.0 && !g_dayHalt && g_dayStartEq > 0.0)
     {
      if(eq <= g_dayStartEq * (1.0 - InpDailyLossPct / 100.0))
        {
         g_dayHalt = true;
         Print("DAILY LOSS HALT: equity ", DoubleToString(eq, 2), " is ",
               DoubleToString(InpDailyLossPct, 1), "% below day start ",
               DoubleToString(g_dayStartEq, 2), " - done for today");
        }
     }

   bool halted = g_hardHalt || g_dayHalt;
   if(halted)
     {
      if(PendingCount() > 0)
         DeletePendings();
      if(InpCloseOnHalt && HasPosition())
         ClosePosition();
     }
   return halted;
  }

bool DayEnabled(const int dow)
  {
   switch(dow)
     {
      case 1: return InpTradeMon;
      case 2: return InpTradeTue;
      case 3: return InpTradeWed;
      case 4: return InpTradeThu;
      case 5: return InpTradeFri;
     }
   return false;
  }

//====================================================================
//  ORDER PLACEMENT
//====================================================================
void PlaceOCO(const datetime srvExpiry)
  {
   double range = g_rangeHigh - g_rangeLow;
   if(InpMinRangePts > 0 && range < InpMinRangePts * _Point)
     {
      g_skipReason = "range below minimum (" + DoubleToString(range / _Point, 0) + " pts)";
      g_traded = true;
      return;
     }
   if(InpMaxRangePts > 0 && range > InpMaxRangePts * _Point)
     {
      g_skipReason = "range above maximum (" + DoubleToString(range / _Point, 0) + " pts)";
      g_traded = true;
      return;
     }
   if(!VolFilterPass(range))
     {
      g_skipReason = "volatility filter: range " + DoubleToString(range / _Point, 0) +
                     " pts < " + DoubleToString(InpVolMult, 2) + " x median " +
                     DoubleToString(g_volMedian / _Point, 0) + " pts";
      Print("Skipping day - ", g_skipReason);
      g_traded = true;
      return;
     }
   if(InpMaxSpreadPts > 0)
     {
      long spread = SymbolInfoInteger(_Symbol, SYMBOL_SPREAD);
      if(spread > InpMaxSpreadPts)
         return;                  // retry on a later tick within the window
     }

   int    digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   double buyPx  = NormalizeDouble(g_rangeHigh, digits);
   double sellPx = NormalizeDouble(g_rangeLow,  digits);
   double lots   = LotsForRisk(range);

   double buyTP  = (InpTargetR > 0.0) ? NormalizeDouble(g_rangeHigh + InpTargetR * range, digits) : 0.0;
   double sellTP = (InpTargetR > 0.0) ? NormalizeDouble(g_rangeLow  - InpTargetR * range, digits) : 0.0;

   long stopLvl = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);

   bool buyOk = true, sellOk = true;
   if(buyPx - ask < stopLvl * _Point)  buyOk  = false;
   if(bid - sellPx < stopLvl * _Point) sellOk = false;

   // if price already broke a side before placement, enter at market instead
   if(!buyOk && ask > buyPx)
     {
      if(trade.Buy(lots, _Symbol, 0.0, sellPx, buyTP, InpComment))
         g_placed = true;
      return;
     }
   if(!sellOk && bid < sellPx)
     {
      if(trade.Sell(lots, _Symbol, 0.0, buyPx, sellTP, InpComment))
         g_placed = true;
      return;
     }

   bool ok = true;
   if(buyOk)
      ok &= trade.BuyStop(lots, buyPx, _Symbol, sellPx, buyTP,
                          ORDER_TIME_SPECIFIED, srvExpiry, InpComment);
   if(sellOk)
      ok &= trade.SellStop(lots, sellPx, _Symbol, buyPx, sellTP,
                           ORDER_TIME_SPECIFIED, srvExpiry, InpComment);
   if(ok)
      g_placed = true;
   else
      Print("Order placement failed: ", trade.ResultRetcodeDescription());
  }

//====================================================================
//  IN-TRADE MANAGEMENT (optional, off by default)
//====================================================================
void ManagePosition()
  {
   if(InpBreakEvenR <= 0.0 && InpTrailR <= 0.0)
      return;
   double range = g_rangeHigh - g_rangeLow;
   if(range <= 0.0)
      return;
   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);

   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetInteger(POSITION_MAGIC) != InpMagic ||
         PositionGetString(POSITION_SYMBOL) != _Symbol)
         continue;

      long   type  = PositionGetInteger(POSITION_TYPE);
      double entry = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl    = PositionGetDouble(POSITION_SL);
      double tp    = PositionGetDouble(POSITION_TP);
      double px    = (type == POSITION_TYPE_BUY)
                     ? SymbolInfoDouble(_Symbol, SYMBOL_BID)
                     : SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      int dir = (type == POSITION_TYPE_BUY) ? +1 : -1;
      double profitR = dir * (px - entry) / range;
      double newSL = sl;

      if(InpBreakEvenR > 0.0 && profitR >= InpBreakEvenR)
        {
         double be = NormalizeDouble(entry, digits);
         if(dir > 0 ? (be > newSL) : (newSL == 0.0 || be < newSL))
            newSL = be;
        }
      if(InpTrailR > 0.0)
        {
         double tr = NormalizeDouble(px - dir * InpTrailR * range, digits);
         if(dir > 0 ? (tr > newSL) : (newSL == 0.0 || tr < newSL))
            newSL = tr;
        }
      if(newSL != sl)
         trade.PositionModify(ticket, newSL, tp);
     }
  }

//====================================================================
//  CHART OBJECTS / DASHBOARD
//====================================================================
void DrawRange(const datetime srvStart, const datetime srvEnd)
  {
   if(!InpDrawObjects) return;
   string name = "ORBP_range_" + TimeToString(srvStart, TIME_DATE);
   if(ObjectFind(0, name) >= 0) return;
   ObjectCreate(0, name, OBJ_RECTANGLE, 0, srvStart, g_rangeLow, srvEnd, g_rangeHigh);
   ObjectSetInteger(0, name, OBJPROP_COLOR, g_volPass ? clrSteelBlue : clrDimGray);
   ObjectSetInteger(0, name, OBJPROP_STYLE, STYLE_DOT);
   ObjectSetInteger(0, name, OBJPROP_FILL, false);
   ObjectSetInteger(0, name, OBJPROP_BACK, true);
  }

void PanelRow(const int row, const string text, const color clr)
  {
   string name = PANEL_PREFIX + "row" + IntegerToString(row);
   if(ObjectFind(0, name) < 0)
     {
      ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, name, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, name, OBJPROP_XDISTANCE, 14);
      ObjectSetInteger(0, name, OBJPROP_YDISTANCE, 26 + row * 17);
      ObjectSetInteger(0, name, OBJPROP_FONTSIZE, 9);
      ObjectSetString(0, name, OBJPROP_FONT, "Consolas");
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
     }
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clr);
  }

void ShowPanel(const datetime lonNow)
  {
   if(!InpShowPanel) return;

   string bg = PANEL_PREFIX + "bg";
   if(ObjectFind(0, bg) < 0)
     {
      ObjectCreate(0, bg, OBJ_RECTANGLE_LABEL, 0, 0, 0);
      ObjectSetInteger(0, bg, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, bg, OBJPROP_XDISTANCE, 6);
      ObjectSetInteger(0, bg, OBJPROP_YDISTANCE, 18);
      ObjectSetInteger(0, bg, OBJPROP_XSIZE, 400);
      ObjectSetInteger(0, bg, OBJPROP_YSIZE, 158);
      ObjectSetInteger(0, bg, OBJPROP_BGCOLOR, C'18,22,30');
      ObjectSetInteger(0, bg, OBJPROP_BORDER_TYPE, BORDER_FLAT);
      ObjectSetInteger(0, bg, OBJPROP_COLOR, C'60,70,90');
      ObjectSetInteger(0, bg, OBJPROP_BACK, false);
      ObjectSetInteger(0, bg, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, bg, OBJPROP_HIDDEN, true);
     }

   color cHead = clrGoldenrod, cTxt = clrGainsboro, cOK = clrMediumSeaGreen,
         cWarn = clrOrange, cBad = clrTomato;

   PanelRow(0, "LONDON ORB PRO   " + _Symbol + "   London " +
               TimeToString(lonNow, TIME_MINUTES), cHead);

   string rng = "Range " + IntegerToString(InpRangeStartHour) + "-" +
                IntegerToString(InpRangeEndHour) + "h: ";
   if(g_rangeHigh > 0.0)
      rng += DoubleToString(g_rangeLow, _Digits) + " / " +
             DoubleToString(g_rangeHigh, _Digits) + "  (" +
             DoubleToString((g_rangeHigh - g_rangeLow) / _Point, 0) + " pts)";
   else
      rng += "(forming)";
   PanelRow(1, rng, cTxt);

   string vf;
   color  vfc = cTxt;
   if(!InpUseVolFilter)
      vf = "Vol filter: OFF";
   else if(g_volMedian <= 0.0)
      vf = "Vol filter: median pending (" + IntegerToString(InpVolLookback) + "d)";
   else
     {
      vf = "Vol filter: median " + DoubleToString(g_volMedian / _Point, 0) +
           " pts x " + DoubleToString(InpVolMult, 2) + "  -> " +
           (g_volPass ? "PASS" : "SKIP DAY");
      vfc = g_volPass ? cOK : cWarn;
     }
   PanelRow(2, vf, vfc);

   string st;
   color  stc = cTxt;
   if(g_hardHalt)            { st = "HALTED: max drawdown limit";        stc = cBad; }
   else if(g_dayHalt)        { st = "HALTED today: daily loss limit";    stc = cBad; }
   else if(HasPosition())    { st = "IN POSITION (exit " + IntegerToString(InpExitHour) + ":00 London)"; stc = cOK; }
   else if(g_traded)         { st = (g_skipReason == "" ? "Done for today"
                                                        : "Skipped: " + g_skipReason); stc = cWarn; }
   else if(g_placed)         { st = "OCO stop orders working";           stc = cOK; }
   else                      { st = "Waiting for breakout window (" +
                                    IntegerToString(InpRangeEndHour) + ":00 London)"; }
   PanelRow(3, "State: " + st, stc);

   double eq = AccountInfoDouble(ACCOUNT_EQUITY);
   string prot = "Equity " + DoubleToString(eq, 2);
   if(g_dayStartEq > 0.0)
      prot += "  day " + DoubleToString((eq / g_dayStartEq - 1.0) * 100.0, 2) + "%";
   if(InpDailyLossPct > 0.0)
      prot += "  (halt at -" + DoubleToString(InpDailyLossPct, 1) + "%)";
   PanelRow(4, prot, cTxt);

   string risk = InpUseRiskPercent
                 ? "Risk " + DoubleToString(InpRiskPercent, 2) + "% / trade"
                 : "Fixed lot " + DoubleToString(InpFixedLot, 2);
   if(InpMaxDrawdownPct > 0.0)
      risk += "   maxDD halt " + DoubleToString(InpMaxDrawdownPct, 1) + "%";
   PanelRow(5, risk, cTxt);

   PanelRow(6, "Exits: " + (InpTargetR > 0 ? "TP " + DoubleToString(InpTargetR, 1) + "R  " : "") +
               (InpBreakEvenR > 0 ? "BE " + DoubleToString(InpBreakEvenR, 1) + "R  " : "") +
               (InpTrailR > 0 ? "trail " + DoubleToString(InpTrailR, 1) + "R  " : "") +
               "time " + IntegerToString(InpExitHour) + ":00 London", cTxt);

   PanelRow(7, "One trade/day | magic " + IntegerToString((int)InpMagic), C'110,120,140');
  }

void RemovePanel()
  {
   ObjectsDeleteAll(0, PANEL_PREFIX);
  }

//====================================================================
//  MQL5 EVENTS
//====================================================================
int OnInit()
  {
   if(InpRangeStartHour >= InpRangeEndHour || InpRangeEndHour > InpHuntEndHour ||
      InpHuntEndHour > InpExitHour || InpExitHour > 23)
     {
      Print("Invalid session hours: need range start < range end <= hunt end <= exit <= 23");
      return INIT_PARAMETERS_INCORRECT;
     }
   if(InpVolLookback < 5 || InpVolLookback > 60)
     {
      Print("Vol lookback must be 5-60 days");
      return INIT_PARAMETERS_INCORRECT;
     }
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(InpSlippagePts);
   trade.SetTypeFillingBySymbol(_Symbol);
   Print("LondonORB Pro started | vol filter ", (InpUseVolFilter ? "ON" : "OFF"),
         " (median ", InpVolLookback, "d x ", DoubleToString(InpVolMult, 2), ")",
         " | daily loss ", (InpDailyLossPct > 0 ? DoubleToString(InpDailyLossPct, 1) + "%" : "off"),
         " | maxDD ", (InpMaxDrawdownPct > 0 ? DoubleToString(InpMaxDrawdownPct, 1) + "%" : "off"));
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   RemovePanel();
   Comment("");
  }

void OnTick()
  {
   datetime srvNow = TimeTradeServer();
   datetime lonNow = ServerToLondon(srvNow);
   datetime lonDay = lonNow - (lonNow % 86400);
   MqlDateTime lt; TimeToStruct(lonNow, lt);

   // ---- new London day: reset state
   if(lonDay != g_curLonDay)
     {
      g_curLonDay = lonDay;
      g_placed     = false;
      g_traded     = false;
      g_rangeHigh  = 0.0;
      g_rangeLow   = 0.0;
      g_volMedian  = 0.0;
      g_volCount   = 0;
      g_volPass    = false;
      g_dayHalt    = false;
      g_skipReason = "";
      g_dayStartEq = AccountInfoDouble(ACCOUNT_EQUITY);
     }

   // ---- weekend guard (Saturday/Sunday London)
   if(lt.day_of_week == 0 || lt.day_of_week == 6)
     {
      ShowPanel(lonNow);
      return;
     }

   // ---- account protection (daily loss / max drawdown)
   if(ProtectionHalted())
     {
      ShowPanel(lonNow);
      return;
     }

   bool inPos = HasPosition();
   if(inPos)
      g_traded = true;

   // ---- OCO: a fill happened -> remove the sibling stop
   if(inPos && PendingCount() > 0)
      DeletePendings();

   // ---- optional break-even / trailing management
   if(inPos)
      ManagePosition();

   // ---- time exit
   if(lt.hour >= InpExitHour)
     {
      if(inPos)
         ClosePosition();
      if(PendingCount() > 0)
         DeletePendings();
      ShowPanel(lonNow);
      return;
     }

   // ---- breakout window over: remove unfilled stops (backup to expiry)
   if(lt.hour >= InpHuntEndHour && !inPos && PendingCount() > 0)
      DeletePendings();

   // ---- place the OCO pair inside the breakout window
   if(!g_placed && !g_traded && lt.hour >= InpRangeEndHour && lt.hour < InpHuntEndHour)
     {
      if(!DayEnabled(lt.day_of_week))
        {
         g_skipReason = "day disabled in settings";
         g_traded = true;
        }
      else
        {
         datetime srvStart = LondonHourToServer(g_curLonDay, InpRangeStartHour);
         datetime srvEnd   = LondonHourToServer(g_curLonDay, InpRangeEndHour);
         if(ComputeRange(srvStart, srvEnd, g_rangeHigh, g_rangeLow))
           {
            PlaceOCO(LondonHourToServer(g_curLonDay, InpHuntEndHour));
            DrawRange(srvStart, srvEnd);
           }
        }
     }

   ShowPanel(lonNow);
  }
//+------------------------------------------------------------------+
