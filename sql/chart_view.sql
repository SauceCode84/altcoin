with trade_history_5min as (
	select to_timestamp(ceil(extract(epoch from timestamp) / 300) * 300) as adjusted_timestamp,	*
	from trade_history
),
trade_history_high_low as (
	select min(value) as low, max(value) as high, currency, price_currency, adjusted_timestamp
	from trade_history_5min
	group by currency, price_currency, adjusted_timestamp
	order by currency, price_currency, adjusted_timestamp
),
trade_history_open as (
	select open, adjusted_timestamp, currency, price_currency
	from
	(
		select
			row_number() over (partition by adjusted_timestamp order by timestamp),
			price as open,
			adjusted_timestamp, currency, price_currency
		from trade_history_5min
	) as q
	where row_number = 1
),
trade_history_close as (
	select open, adjusted_timestamp, currency, price_currency
	from
	(
		select
			row_number() over (partition by adjusted_timestamp order by timestamp desc),
			price as open,
			adjusted_timestamp, currency, price_currency
		from trade_history_5min
	) as q
	where row_number = 1
),
trade_history_volume as (
	select sum(value) as volume, adjusted_timestamp, currency, price_currency
	from trade_history_5min
	group by adjusted_timestamp, currency, price_currency
	order by adjusted_timestamp
),
trade_history_open_close as (
	select *
	from trade_history_5min
)

select *
from trade_history_open


/*
select *
from trade_history_high_low as hl
join trade_history_volume as v
on hl.currency = v.currency
and hl.price_currency = v.price_currency
and hl.adjusted_timestamp = v.adjusted_timestamp
*/